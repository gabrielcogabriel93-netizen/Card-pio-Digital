import type { Order } from '@/types'

// Mensagens 1 pra 1 disparadas pro cliente quando o status do pedido muda
// — só se a loja tiver ligado o toggle em Painel > WhatsApp. Compartilhada
// entre o Kanban (app/painel/pedidos/page.tsx, aceite manual) e o webhook
// do Mercado Pago (lib/orderAutoConfirm.ts, aceite automático) pra não
// ficar duas cópias do mesmo texto se desalinhando com o tempo.
export const STATUS_NOTIFICATION_MESSAGES: Partial<Record<Order['status'], (order: Pick<Order, 'order_type'>) => string>> = {
  confirmed: () => 'Recebemos seu pedido! Já estamos preparando tudo. 👍',
  preparing: () => 'Seu pedido está sendo preparado! 👨‍🍳',
  completed: (order) => order.order_type === 'pickup'
    ? 'Seu pedido está pronto para retirada! 📦'
    : 'Seu pedido saiu para entrega! 🛵',
}
