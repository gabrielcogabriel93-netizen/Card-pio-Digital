import { createClient } from '@/lib/supabase/client'
import { log, logError } from '@/lib/logger'

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

// A chave VAPID pública vem em base64url; a Push API espera um Uint8Array.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

interface BrowserSubscriptionResult {
  ok: boolean
  error?: string
  endpoint?: string
  p256dh?: string
  auth?: string
}

// Pede permissão e garante que o navegador tem uma inscrição de push
// ativa — a MESMA inscrição (endpoint) vale pro site inteiro, não por
// página/pedido. Quem chama isso decide em qual tabela guardar o
// endpoint (push_subscriptions pro lojista, order_push_subscriptions pro
// cliente acompanhando um pedido).
async function ensureBrowserSubscription(): Promise<BrowserSubscriptionResult> {
  if (!isPushSupported()) return { ok: false, error: 'Seu navegador não suporta notificações push.' }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidPublicKey) return { ok: false, error: 'Notificações push não configuradas no servidor.' }

  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      return { ok: false, error: 'Permissão de notificação negada.' }
    }

    const registration = await navigator.serviceWorker.ready
    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      })
    }

    const json = subscription.toJSON()
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, error: 'Inscrição inválida retornada pelo navegador.' }
    }

    return { ok: true, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth }
  } catch (err: any) {
    logError('push', 'erro ao garantir inscrição do navegador', err)
    return { ok: false, error: err.message || 'Erro ao ativar notificações.' }
  }
}

export async function subscribeToPush(establishmentId: string): Promise<{ ok: boolean; error?: string }> {
  const result = await ensureBrowserSubscription()
  if (!result.ok) return result

  try {
    const supabase = createClient()
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        establishment_id: establishmentId,
        endpoint: result.endpoint,
        p256dh: result.p256dh,
        auth: result.auth,
        user_agent: navigator.userAgent,
      },
      { onConflict: 'endpoint' }
    )

    if (error) throw error

    log('push', 'inscrição do lojista salva com sucesso')
    return { ok: true }
  } catch (err: any) {
    logError('push', 'erro ao inscrever loja para notificações', err)
    return { ok: false, error: err.message || 'Erro ao ativar notificações.' }
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return
  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (!subscription) return

    const endpoint = subscription.endpoint
    await subscription.unsubscribe()

    const supabase = createClient()
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  } catch (err) {
    logError('push', 'erro ao cancelar inscrição', err)
  }
}

export async function sendTestPush(establishmentId: string): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ establishment_id: establishmentId, test: true }),
    })
    const data = await response.json()
    if (!response.ok) return { ok: false, message: data.error || 'Erro ao enviar teste.' }
    if (data.sent === 0) return { ok: false, message: 'Nenhum dispositivo inscrito para receber o teste.' }
    return { ok: true, message: `Notificação de teste enviada para ${data.sent} dispositivo(s).` }
  } catch (err: any) {
    logError('push', 'erro ao enviar push de teste', err)
    return { ok: false, message: 'Erro ao enviar teste.' }
  }
}

// ============================================================
// Notificação push por PEDIDO (cliente acompanhando /pedido/[id]) — a
// mesma inscrição de navegador pode estar ligada a vários pedidos ao
// mesmo tempo (ver migration 028), por isso cada função aqui recebe
// `orderId` e mexe só na linha daquele pedido, nunca na inscrição do
// navegador como um todo.
// ============================================================

const orderPushStorageKey = (orderId: string) => `push-subscribed-order-${orderId}`

export function hasLocalOrderPushSubscription(orderId: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(orderPushStorageKey(orderId)) === '1'
  } catch {
    return false
  }
}

export async function subscribeToOrderPush(orderId: string): Promise<{ ok: boolean; error?: string }> {
  const result = await ensureBrowserSubscription()
  if (!result.ok) return result

  try {
    const supabase = createClient()
    const { error } = await supabase.from('order_push_subscriptions').upsert(
      {
        order_id: orderId,
        endpoint: result.endpoint,
        p256dh: result.p256dh,
        auth: result.auth,
        user_agent: navigator.userAgent,
      },
      { onConflict: 'order_id,endpoint' }
    )

    if (error) throw error

    try {
      window.localStorage.setItem(orderPushStorageKey(orderId), '1')
    } catch {
      // localStorage indisponível (modo privado etc.) — não impede a inscrição de valer.
    }

    log('push', 'inscrição do pedido salva com sucesso', { orderId })
    return { ok: true }
  } catch (err: any) {
    logError('push', 'erro ao inscrever pedido para notificações', err)
    return { ok: false, error: err.message || 'Erro ao ativar notificações.' }
  }
}

// Só remove a inscrição DESSE pedido — nunca chama
// subscription.unsubscribe() do navegador, porque a inscrição é por
// origem, não por pedido (mataria o acompanhamento de outros pedidos, ou
// até as notificações do lojista, se for o mesmo aparelho).
export async function unsubscribeFromOrderPush(orderId: string): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (subscription) {
      const supabase = createClient()
      await supabase.from('order_push_subscriptions').delete().eq('order_id', orderId).eq('endpoint', subscription.endpoint)
    }
  } catch (err) {
    logError('push', 'erro ao cancelar inscrição do pedido', err)
  } finally {
    try {
      window.localStorage.removeItem(orderPushStorageKey(orderId))
    } catch {
      // ignora
    }
  }
}

// ============================================================
// App DA LOJA no aparelho do cliente (migration 049). Cada aparelho tem
// uma chave aleatória por loja, guardada nele: conta a instalação mesmo
// antes de o cliente aceitar notificações e liga ao telefone quando o
// aparelho tem o token do cliente (prova de que é dele).
// ============================================================

export type StoreNotifyState = 'unsupported' | 'ios-install-first' | 'denied' | 'off' | 'on'

const deviceKeyStorage = (establishmentId: string) => `fregues:device:${establishmentId}`
const storeNotifyStorage = (establishmentId: string) => `fregues:avisos:${establishmentId}`

export function isStandaloneApp(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true)
  )
}

export function devicePlatform(): 'ios' | 'android' | 'desktop' {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent
  if (/iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  if (/android/i.test(ua)) return 'android'
  return 'desktop'
}

function getDeviceKey(establishmentId: string): string {
  try {
    let key = localStorage.getItem(deviceKeyStorage(establishmentId))
    if (!key) {
      key = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '')
      localStorage.setItem(deviceKeyStorage(establishmentId), key)
    }
    return key
  } catch {
    return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '')
  }
}

/** Situação dos avisos da loja neste aparelho. */
export function storeNotifyState(establishmentId: string): StoreNotifyState {
  if (typeof window === 'undefined') return 'unsupported'
  // No iPhone a notificação só existe com o app instalado na tela inicial.
  if (devicePlatform() === 'ios' && !isStandaloneApp()) return 'ios-install-first'
  if (!isPushSupported() || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  try {
    if (Notification.permission === 'granted' && localStorage.getItem(storeNotifyStorage(establishmentId)) === '1') return 'on'
  } catch {}
  return 'off'
}

interface CustomerLink {
  phone?: string | null
  token?: string | null
  name?: string | null
}

async function registerDevice(establishmentId: string, push: BrowserSubscriptionResult | null, customer: CustomerLink) {
  const supabase = createClient()
  const { error } = await supabase.rpc('register_customer_device', {
    p_establishment_id: establishmentId,
    p_device_key: getDeviceKey(establishmentId),
    p_endpoint: push?.endpoint ?? null,
    p_p256dh: push?.p256dh ?? null,
    p_auth: push?.auth ?? null,
    p_installed: isStandaloneApp(),
    p_platform: devicePlatform(),
    p_phone: customer.phone || null,
    p_token: customer.token || null,
    p_name: customer.name || null,
  })
  if (error) throw error
}

/**
 * Visita no cardápio: registra o aparelho (instalado ou não) sem pedir
 * nada ao cliente. Se ele já tinha aceitado os avisos, renova o endereço.
 */
export async function touchStoreDevice(establishmentId: string, customer: CustomerLink = {}): Promise<void> {
  try {
    let push: BrowserSubscriptionResult | null = null
    if (isPushSupported() && 'Notification' in window && Notification.permission === 'granted') {
      const registration = await navigator.serviceWorker.getRegistration()
      const json = (await registration?.pushManager.getSubscription())?.toJSON()
      if (json?.endpoint && json.keys?.p256dh && json.keys?.auth) {
        push = { ok: true, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth }
      }
    }
    // Sem app instalado, sem avisos e sem cliente: nada a registrar.
    if (!push && !isStandaloneApp() && !customer.token) return
    await registerDevice(establishmentId, push, customer)
  } catch (err) {
    log('push', 'não foi possível registrar o aparelho na loja', err)
  }
}

/** Pede permissão e liga os avisos da loja (e do pedido, se houver). */
export async function enableStoreNotifications(
  establishmentId: string,
  customer: CustomerLink = {},
  orderId?: string | null
): Promise<{ ok: boolean; error?: string }> {
  const push = await ensureBrowserSubscription()
  if (!push.ok) return push
  try {
    await registerDevice(establishmentId, push, customer)
    if (orderId) {
      const supabase = createClient()
      await supabase.from('order_push_subscriptions').upsert(
        { order_id: orderId, endpoint: push.endpoint, p256dh: push.p256dh, auth: push.auth, user_agent: navigator.userAgent },
        { onConflict: 'order_id,endpoint' }
      )
      try {
        localStorage.setItem(orderPushStorageKey(orderId), '1')
      } catch {}
    }
    try {
      localStorage.setItem(storeNotifyStorage(establishmentId), '1')
    } catch {}
    return { ok: true }
  } catch (err: any) {
    logError('push', 'erro ao ativar avisos da loja', err)
    return { ok: false, error: err.message || 'Não foi possível ativar os avisos.' }
  }
}

export async function disableStoreNotifications(establishmentId: string): Promise<void> {
  try {
    const supabase = createClient()
    await supabase.rpc('unregister_customer_device', { p_establishment_id: establishmentId, p_device_key: getDeviceKey(establishmentId) })
  } catch (err) {
    logError('push', 'erro ao desativar avisos da loja', err)
  } finally {
    try {
      localStorage.removeItem(storeNotifyStorage(establishmentId))
    } catch {}
  }
}
