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
 * Efeitos colaterais do "primeiro aceite" de um pedido, só que disparados
 * pelo webhook do Mercado Pago em vez de um clique do lojista — espelha
 * (sem duplicar 1:1) o que `handleUpdateStatus` faz em
 * app/painel/pedidos/page.tsx quando o pedido passa a 'confirmed'/'completed'
 * pela primeira vez: lança financeiro, baixa estoque, notifica o cliente.
 *
 * Assume que a trava de idempotência (UPDATE condicional em
 * payment_status='pending', feita por quem chama isso) já garantiu que só
 * roda uma vez por pagamento aprovado — não faz checagem própria de novo.
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
  if (financeError) logError('mercadopago:webhook', 'erro ao lançar financeiro do pedido', financeError)

  for (const item of order.items) {
    const { data: product, error: productError } = await admin
      .from('products')
      .select('track_stock')
      .eq('id', item.product_id)
      .maybeSingle()

    if (productError) {
      logError('mercadopago:webhook', 'erro ao buscar produto para ajuste de estoque', productError)
      continue
    }

    if (product?.track_stock) {
      const { error: stockError } = await admin.rpc('decrement_product_stock', {
        product_id: item.product_id,
        quantity: item.quantity,
      })
      if (stockError) logError('mercadopago:webhook', 'erro ao baixar estoque', stockError)
    }
  }

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
        logError('mercadopago:webhook', 'erro ao notificar WhatsApp', err)
      }
    }
  }

  // Notificação push pro cliente, se ele tiver ativado em /pedido/[id] —
  // mesmo espírito do WhatsApp acima, independente dele estar ligado ou
  // não (é um canal separado que o cliente escolheu por conta própria).
  if (order.source === 'online') {
    try {
      await fetch(`${getBaseUrl()}/api/push/send-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: order.id }),
      })
    } catch (err) {
      logError('mercadopago:webhook', 'erro ao notificar push do pedido', err)
    }
  }
}
