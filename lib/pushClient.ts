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

export async function subscribeToPush(establishmentId: string): Promise<{ ok: boolean; error?: string }> {
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

    const supabase = createClient()
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        establishment_id: establishmentId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent,
      },
      { onConflict: 'endpoint' }
    )

    if (error) throw error

    log('push', 'inscrição salva com sucesso')
    return { ok: true }
  } catch (err: any) {
    logError('push', 'erro ao inscrever para notificações', err)
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
