import type { SupabaseClient } from '@supabase/supabase-js'
import { STATUS_NOTIFICATION_MESSAGES } from './orderStatusMessages'
import { MERCADOPAGO_COMMISSION_AMOUNT } from './mercadoPago'
import { getBaseUrl } from './baseUrl'
import { logError } from './logger'
import type { Order, Establishment } from '@/types'

/**
 * Pra qual status o pedido pula sozinho quando o pagamento é aprovado —
 * mesma regra que o aceite manual usa (app/painel/pedidos/page.tsx): lojas
 * com acompanhamento desligado pulam direto pra "Concluído".
 */
export function resolveAutoConfirmStatus(orderTrackingEnabled: boolean): 'confirmed' | 'completed' {
  return orderTrackingEnabled ? 'confirmed' : 'completed'
}

type EstablishmentForAutoConfirm = Pick<Establishment, 'whatsapp_notifications_enabled'>

/**
 * Notificação de mudança de status pro cliente — WhatsApp (se a loja
 * ligou o toggle) e push (se o cliente ativou em /pedido/[id]). Usada
 * tanto pelo aceite automático (financeiro+estoque) quanto pelos passos
 * seguintes (só status, sem financeiro/estoque de novo) — um só lugar
 * pro texto e pro disparo, pra não desalinhar as duas rotas com o tempo.
 */
async function notifyStatusChange(
  order: Order,
  newStatus: 'confirmed' | 'preparing' | 'completed',
  establishment: EstablishmentForAutoConfirm,
  logScope: string
): Promise<void> {
  if (establishment.whatsapp_notifications_enabled && order.source === 'online' && order.customer_phone) {
    const message = STATUS_NOTIFICATION_MESSAGES[newStatus]?.(order)
    if (message) {
      try {
        await fetch(`${getBaseUrl()}/api/whatsapp/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ establishment_id: order.establishment_id, phone: order.customer_phone, message }),
        })
      } catch (err) {
        logError(logScope, 'erro ao notificar WhatsApp', err)
      }
    }
  }

  // Push pro cliente, se ele tiver ativado em /pedido/[id] — canal
  // separado, dispara independente do WhatsApp estar ligado ou não.
  if (order.source === 'online') {
    try {
      await fetch(`${getBaseUrl()}/api/push/send-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: order.id }),
      })
    } catch (err) {
      logError(logScope, 'erro ao notificar push do pedido', err)
    }
  }
}

/**
 * Efeitos colaterais do "primeiro aceite" de um pedido — lança
 * financeiro, baixa estoque, notifica o cliente. Usada tanto pelo
 * webhook do Mercado Pago (pagamento aprovado) quanto pela automação por
 * tempo (app/api/cron/advance-orders) quando um pedido pendente vira
 * confirmado/concluído sozinho.
 *
 * Assume que a trava de idempotência (UPDATE condicional em
 * payment_status='pending' ou em status='pending', feita por quem chama
 * isso) já garantiu que só roda uma vez — não faz checagem própria de novo.
 */
export async function applyAutomaticOrderConfirmation(
  admin: SupabaseClient,
  order: Order,
  newStatus: 'confirmed' | 'completed',
  establishment: EstablishmentForAutoConfirm
): Promise<void> {
  const { error: financeError } = await admin.from('financial_entries').insert([
    {
      establishment_id: order.establishment_id,
      order_id: order.id,
      type: 'income',
      amount: order.total,
      description: `Pedido #${order.id.slice(0, 8)} - ${order.customer_name}`,
    },
    {
      establishment_id: order.establishment_id,
      order_id: order.id,
      type: 'expense',
      amount: MERCADOPAGO_COMMISSION_AMOUNT,
      description: 'Comissão da plataforma (Mercado Pago)',
    },
  ])
  if (financeError) logError('order-auto-confirm', 'erro ao lançar financeiro do pedido', financeError)

  for (const item of order.items) {
    const { data: product, error: productError } = await admin
      .from('products')
      .select('track_stock')
      .eq('id', item.product_id)
      .maybeSingle()

    if (productError) {
      logError('order-auto-confirm', 'erro ao buscar produto para ajuste de estoque', productError)
      continue
    }

    if (product?.track_stock) {
      const { error: stockError } = await admin.rpc('decrement_product_stock', {
        product_id: item.product_id,
        quantity: item.quantity,
      })
      if (stockError) logError('order-auto-confirm', 'erro ao baixar estoque', stockError)
    }
  }

  await notifyStatusChange(order, newStatus, establishment, 'order-auto-confirm')
}

/**
 * Avança um pedido já confirmado pra próxima etapa (confirmado -> em
 * preparo, em preparo -> concluído) sem financeiro/estoque de novo —
 * isso já aconteceu no primeiro aceite. Só notifica; assume que quem
 * chamou (app/api/cron/advance-orders) já atualizou `status` no banco de
 * forma condicional/idempotente antes de chamar isso — mesmo contrato de
 * `applyAutomaticOrderConfirmation`.
 */
export async function applyStatusOnly(
  order: Order,
  newStatus: 'preparing' | 'completed',
  establishment: EstablishmentForAutoConfirm
): Promise<void> {
  await notifyStatusChange(order, newStatus, establishment, 'order-automation')
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

/**
 * Decide pra qual status (se algum) um pedido deve avançar sozinho,
 * dado quanto tempo já se passou desde a última troca de status. Função
 * pura (sem I/O) — só a regra de negócio, testável isoladamente. Quem
 * chama (app/api/cron/advance-orders) é responsável por buscar os
 * pedidos e aplicar a mudança de verdade.
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
    // tirar esse pedido de "pendente". Sem essa trava, a loja liberaria
    // pedido pra cozinha antes do cliente ter pago.
    if (order.paymentMethod === 'mercadopago_pix' && order.paymentStatus !== 'approved') return null
    if (elapsedMinutes < timings.autoConfirmMinutes) return null
    return order.orderTrackingEnabled ? 'confirmed' : 'completed'
  }

  if (order.status === 'confirmed') {
    // Loja sem acompanhamento nunca deveria ter um pedido 'confirmed'
    // (o primeiro aceite já vai direto pra 'completed') — por segurança,
    // não faz nada se acontecer mesmo assim.
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
