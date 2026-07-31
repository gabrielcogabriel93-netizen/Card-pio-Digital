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
