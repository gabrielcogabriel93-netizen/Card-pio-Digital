import type { Order } from '@/types'

type MessageOrder = Pick<Order, 'order_type'> & { eta_minutes?: number | null }

// Mensagens 1 pra 1 enviadas ao cliente quando o pedido muda de etapa
// (WhatsApp, se a loja ligou o toggle, e push). Compartilhadas entre o
// Kanban, o webhook do Mercado Pago e a automação por tempo, para o texto
// não divergir. 'dispatched' é "saiu para entrega / pronto para retirar"
// (orders.dispatched_at), que não é um status próprio.
export type NotifiableStep = 'confirmed' | 'preparing' | 'completed' | 'dispatched'

export const STATUS_NOTIFICATION_MESSAGES: Partial<Record<NotifiableStep, (order: MessageOrder) => string>> = {
  confirmed: (order) =>
    order.eta_minutes
      ? `Recebemos seu pedido! 👍 Previsão: cerca de ${order.eta_minutes} min.`
      : 'Recebemos seu pedido! Já estamos preparando tudo. 👍',
  preparing: () => 'Seu pedido está sendo preparado! 👨‍🍳',
  dispatched: (order) =>
    order.order_type === 'pickup' ? 'Seu pedido está pronto para retirada! 📦' : 'Seu pedido saiu para entrega! 🛵',
  completed: (order) =>
    order.order_type === 'pickup' ? 'Pedido retirado. Obrigado e volte sempre! 🧡' : 'Pedido entregue. Bom apetite! 🧡',
}
