import { createAdminClient } from '@/lib/supabase/admin'
import { getWebPush } from '@/lib/webpush'
import { STATUS_NOTIFICATION_MESSAGES, type NotifiableStep } from '@/lib/orderStatusMessages'
import { logError } from '@/lib/logger'

export interface OrderPushResult {
  sent: number
  removed: number
  total: number
  message?: string
}

// Etapa atual do pedido para escolher o texto: concluído, "saiu" (tem
// dispatched_at mas ainda não concluiu) ou o próprio status.
function currentStep(order: { status: string; dispatched_at: string | null }): NotifiableStep | null {
  if (order.status === 'completed') return 'completed'
  if (order.dispatched_at && (order.status === 'confirmed' || order.status === 'preparing')) return 'dispatched'
  if (order.status === 'confirmed' || order.status === 'preparing') return order.status
  return null
}

/**
 * Push para quem ativou notificações num PEDIDO (página /pedido/[id]).
 * O texto vem sempre do estado atual do pedido no banco (nunca do
 * chamador) e leva o nome e o logo da loja: o cliente vê a marca dela.
 */
export async function sendOrderPush(orderId: string): Promise<OrderPushResult> {
  const admin = createAdminClient()

  const { data: order, error: orderError } = await admin
    .from('orders')
    .select('id, status, order_type, eta_minutes, dispatched_at, establishments(name, logo_url)')
    .eq('id', orderId)
    .maybeSingle()

  if (orderError) throw orderError
  if (!order) return { sent: 0, removed: 0, total: 0, message: 'Pedido não encontrado' }

  const step = currentStep(order as any)
  const message = step ? STATUS_NOTIFICATION_MESSAGES[step]?.(order as any) : null
  if (!message) return { sent: 0, removed: 0, total: 0, message: 'Sem notificação pra esse status' }

  const { data: subscriptions, error: subsError } = await admin
    .from('order_push_subscriptions')
    .select('*')
    .eq('order_id', order.id)

  if (subsError) throw subsError
  if (!subscriptions || subscriptions.length === 0) return { sent: 0, removed: 0, total: 0, message: 'Nenhuma inscrição ativa para esse pedido' }

  const store = (order as any).establishments as { name?: string; logo_url?: string | null } | null
  const payload = JSON.stringify({
    title: store?.name || 'Atualização do seu pedido',
    body: message,
    url: `/pedido/${order.id}`,
    icon: store?.logo_url || undefined,
  })

  const webpush = getWebPush()
  let sent = 0
  const staleIds: string[] = []

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
        sent++
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) staleIds.push(sub.id)
        else logError('push:order', 'erro ao enviar push', err)
      }
    })
  )

  if (staleIds.length > 0) {
    await admin.from('order_push_subscriptions').delete().in('id', staleIds)
  }

  return { sent, removed: staleIds.length, total: subscriptions.length }
}
