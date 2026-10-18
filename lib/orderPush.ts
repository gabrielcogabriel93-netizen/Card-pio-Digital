import { createAdminClient } from '@/lib/supabase/admin'
import { STATUS_NOTIFICATION_MESSAGES, type NotifiableStep } from '@/lib/orderStatusMessages'
import { sendToTargets, targetsForPhone, type PushTarget } from '@/lib/customerPush'

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
 * Aviso de status do pedido (substitui o WhatsApp). Vai para quem ativou
 * na página do pedido E para os aparelhos do cliente com o app da loja.
 * O texto vem sempre do estado atual do pedido no banco (nunca do
 * chamador) e leva o nome e o logo da loja: o cliente vê a marca dela.
 */
export async function sendOrderPush(orderId: string): Promise<OrderPushResult> {
  const admin = createAdminClient()

  const { data: order, error: orderError } = await admin
    .from('orders')
    .select('id, status, order_type, eta_minutes, dispatched_at, source, customer_phone, establishment_id, establishments(name, logo_url)')
    .eq('id', orderId)
    .maybeSingle()

  if (orderError) throw orderError
  if (!order) return { sent: 0, removed: 0, total: 0, message: 'Pedido não encontrado' }

  const step = currentStep(order as any)
  const message = step ? STATUS_NOTIFICATION_MESSAGES[step]?.(order as any) : null
  if (!message) return { sent: 0, removed: 0, total: 0, message: 'Sem notificação pra esse status' }

  const { data: orderSubs, error: subsError } = await admin
    .from('order_push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('order_id', order.id)
  if (subsError) throw subsError

  const deviceTargets = order.source === 'online' ? await targetsForPhone(admin, order.establishment_id, order.customer_phone) : []
  const targets: PushTarget[] = [...(orderSubs || []), ...deviceTargets]
  if (targets.length === 0) return { sent: 0, removed: 0, total: 0, message: 'Nenhum aparelho para avisar' }

  const store = (order as any).establishments as { name?: string; logo_url?: string | null } | null
  const result = await sendToTargets(admin, targets, {
    title: store?.name || 'Atualização do seu pedido',
    body: `${message} · Pedido #${order.id.slice(0, 6).toUpperCase()}`,
    url: `/pedido/${order.id}`,
    icon: store?.logo_url,
    tag: `pedido-${order.id}`,
  })

  // Inscrição por pedido que não existe mais sai da tabela do pedido também.
  if (result.staleEndpoints.length > 0 && orderSubs?.length) {
    await admin.from('order_push_subscriptions').delete().eq('order_id', order.id).in('endpoint', result.staleEndpoints)
  }
  return { sent: result.sent, removed: result.removed, total: targets.length }
}
