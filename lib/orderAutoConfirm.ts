import type { SupabaseClient } from '@supabase/supabase-js'
import { sendOrderPush } from './orderPush'
import { logError } from './logger'
import type { Order } from '@/types'

/**
 * Pra qual status o pedido pula sozinho quando o pagamento é aprovado —
 * mesma regra que o aceite manual usa (app/painel/pedidos/page.tsx): lojas
 * com acompanhamento desligado pulam direto pra "Concluído".
 */
export function resolveAutoConfirmStatus(orderTrackingEnabled: boolean): 'confirmed' | 'completed' {
  return orderTrackingEnabled ? 'confirmed' : 'completed'
}

/**
 * Aviso de mudança de status pro cliente, por notificação do app da loja
 * (substitui o WhatsApp). Roda no SERVIDOR (webhook do Mercado Pago,
 * cron); o texto vem do estado do pedido no banco (lib/orderPush.ts).
 */
export async function notifyStatusChange(
  order: Pick<Order, 'id' | 'source'>,
  logScope: string
): Promise<void> {
  if (order.source !== 'online') return
  try {
    await sendOrderPush(order.id)
  } catch (err) {
    logError(logScope, 'erro ao notificar push do pedido', err)
  }
}

/**
 * Primeiro aceite automático (webhook do Mercado Pago com pagamento
 * aprovado, ou automação por tempo). Status, financeiro, comissão do Pix
 * e estoque mudam juntos numa transação no banco (service_accept_order,
 * migration 045). Devolve o pedido atualizado, ou null se outra
 * execução já tinha processado (idempotente).
 */
export async function applyAutomaticOrderConfirmation(
  admin: SupabaseClient,
  orderId: string,
  newStatus: 'confirmed' | 'completed'
): Promise<Order | null> {
  const { data, error } = await admin.rpc('service_accept_order', { p_order_id: orderId, p_new_status: newStatus })
  if (error) {
    logError('order-auto-confirm', 'erro ao aceitar pedido automaticamente', error)
    throw error
  }
  const order = (data as Order | null) && (data as Order).id ? (data as Order) : null
  if (!order) return null

  await notifyStatusChange(order, 'order-auto-confirm')
  return order
}

/**
 * Avança um pedido já confirmado pra próxima etapa (confirmado -> em
 * preparo, em preparo -> concluído) sem financeiro/estoque de novo. Só
 * notifica; quem chamou já atualizou `status` de forma condicional.
 */
export async function applyStatusOnly(order: Order): Promise<void> {
  await notifyStatusChange(order, 'order-automation')
}

export interface AutomationTimings {
  autoConfirmMinutes: number
  autoPreparingMinutes: number
  autoCompletedMinutesPickup: number
  autoCompletedMinutesDelivery: number
}

export interface OrderForAutomation {
  status: 'pending' | 'confirmed' | 'preparing'
  orderType: 'delivery' | 'pickup'
  paymentMethod?: string | null
  paymentStatus?: string | null
  statusChangedAt: Date
  orderTrackingEnabled: boolean
}

// Pedido pendente mais velho que isso não é confirmado sozinho: provavelmente
// ficou esquecido (loja fechou, cliente desistiu) e precisa de um humano.
export const AUTOMATION_MAX_PENDING_AGE_MINUTES = 12 * 60

/**
 * Decide pra qual status (se algum) um pedido deve avançar sozinho,
 * dado quanto tempo já se passou desde a última troca de status. Função
 * pura (sem I/O) — só a regra de negócio, testável isoladamente.
 */
export function resolveNextAutomaticStatus(
  order: OrderForAutomation,
  timings: AutomationTimings,
  now: Date = new Date()
): 'confirmed' | 'preparing' | 'completed' | null {
  const elapsedMinutes = (now.getTime() - order.statusChangedAt.getTime()) / 60000

  if (order.status === 'pending') {
    // Pix automático ainda não pago nunca avança sozinho daqui — só a
    // confirmação de pagamento de verdade (webhook do Mercado Pago) pode
    // tirar esse pedido de "pendente".
    if (order.paymentMethod === 'mercadopago_pix' && order.paymentStatus !== 'approved') return null
    if (elapsedMinutes < timings.autoConfirmMinutes) return null
    if (elapsedMinutes > AUTOMATION_MAX_PENDING_AGE_MINUTES) return null
    return order.orderTrackingEnabled ? 'confirmed' : 'completed'
  }

  if (order.status === 'confirmed') {
    if (!order.orderTrackingEnabled) return null
    if (elapsedMinutes < timings.autoPreparingMinutes) return null
    return 'preparing'
  }

  if (order.status === 'preparing') {
    const minutes = order.orderType === 'delivery' ? timings.autoCompletedMinutesDelivery : timings.autoCompletedMinutesPickup
    if (elapsedMinutes < minutes) return null
    return 'completed'
  }

  return null
}
