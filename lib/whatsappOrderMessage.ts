import type { OrderItem, DeliveryAddress } from '@/types'
import { paymentMethodLabel } from './paymentMethods'

const money = (v: number) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`

export interface WhatsAppOrderMessageInput {
  storeName: string
  orderId: string
  customerName: string
  customerPhone: string
  orderType: 'delivery' | 'pickup'
  address?: Pick<DeliveryAddress, 'street' | 'number' | 'neighborhood' | 'complement' | 'reference' | 'zip_code'> | null
  // Itens e valores DEVOLVIDOS pelo servidor (place_order), não os do
  // carrinho: a mensagem sempre bate com o que a loja vê no painel.
  items: OrderItem[]
  subtotal: number
  discount: number
  shippingFee: number
  total: number
  discountLabel?: string | null
  paymentMethod?: string | null
  changeFor?: number | null
  notes?: string | null
  trackingUrl: string
}

/** Texto do pedido enviado para o WhatsApp da loja. */
export function buildWhatsAppOrderMessage(input: WhatsAppOrderMessageInput): string {
  const lines: string[] = []
  lines.push(`🛵 *Novo pedido #${input.orderId.slice(0, 8)} - ${input.storeName}*`, '')
  lines.push(`👤 *Cliente:* ${input.customerName}`)
  lines.push(`📱 *Telefone:* ${input.customerPhone}`)
  lines.push(input.orderType === 'delivery' ? '🛵 *Entrega*' : '🏪 *Retirada no local*')

  if (input.orderType === 'delivery' && input.address) {
    let addr = `📍 *Endereço:* ${input.address.street}, ${input.address.number}`
    if (input.address.complement) addr += ` - ${input.address.complement}`
    addr += ` - ${input.address.neighborhood}`
    lines.push(addr)
    if (input.address.zip_code) lines.push(`   CEP: ${input.address.zip_code}`)
    if (input.address.reference) lines.push(`   Referência: ${input.address.reference}`)
  }

  lines.push('', '📋 *Itens:*')
  input.items.forEach((item, index) => {
    lines.push('', `${index + 1}. *${item.product_name}*`)
    for (const v of item.variations || []) {
      lines.push(`   - ${v.group_name}: ${v.option_name}${v.price_delta > 0 ? ` (+${money(v.price_delta)})` : ''}`)
    }
    if (item.note) lines.push(`   📝 ${item.note}`)
    lines.push(`   ${item.quantity} x ${money(item.unit_price)} = ${money(item.total_price)}`)
  })

  lines.push('', `Subtotal: ${money(input.subtotal)}`)
  if (input.discount > 0) lines.push(`🏷️ Desconto${input.discountLabel ? ` (${input.discountLabel})` : ''}: -${money(input.discount)}`)
  if (input.orderType === 'delivery') lines.push(input.shippingFee > 0 ? `🛵 Entrega: ${money(input.shippingFee)}` : '🚚 Entrega grátis')
  lines.push(`💰 *Total: ${money(input.total)}*`)

  if (input.paymentMethod) {
    let pay = `💳 *Pagamento:* ${paymentMethodLabel(input.paymentMethod)}`
    if (input.paymentMethod === 'dinheiro') pay += input.changeFor ? ` (troco para ${money(input.changeFor)})` : ' (sem troco)'
    lines.push(pay)
  }
  if (input.notes) lines.push('', `📝 *Observações:* ${input.notes}`)

  lines.push('', '📍 *Acompanhe o pedido:*', input.trackingUrl)
  return lines.join('\n')
}
