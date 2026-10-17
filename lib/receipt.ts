import type { Order } from '@/types'
import { paymentMethodLabel } from './paymentMethods'

// Comanda em texto puro para impressora térmica (58mm = 32 colunas,
// 80mm = 48 colunas). Usada pelo app RawBT no Android (imprime direto na
// térmica Bluetooth/USB, sem diálogo do navegador) e como base do layout
// impresso pelo navegador.

export type PaperWidth = 58 | 80

const columnsFor = (width: PaperWidth) => (width === 58 ? 32 : 48)
const money = (v: number) => Number(v || 0).toFixed(2).replace('.', ',')

function stripAccents(s: string) {
  // Muitas térmicas baratas não têm tabela com acento: imprime sem.
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function line(left: string, right: string, cols: number) {
  const space = Math.max(1, cols - left.length - right.length)
  if (left.length + right.length + 1 > cols) {
    return `${left.slice(0, cols)}\n${' '.repeat(Math.max(0, cols - right.length))}${right}`
  }
  return left + ' '.repeat(space) + right
}

function wrap(text: string, cols: number, indent = ''): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const out: string[] = []
  let current = indent
  for (const word of words) {
    if ((current + word).length > cols && current.trim()) {
      out.push(current.trimEnd())
      current = indent
    }
    current += `${word} `
  }
  if (current.trim()) out.push(current.trimEnd())
  return out
}

export interface ReceiptOptions {
  storeName: string
  width: PaperWidth
  tableLabel?: string | null
  now?: Date
}

export function buildReceiptText(order: Order, opts: ReceiptOptions): string {
  const cols = columnsFor(opts.width)
  const dash = '-'.repeat(cols)
  const center = (s: string) => ' '.repeat(Math.max(0, Math.floor((cols - s.length) / 2))) + s
  const out: string[] = []

  out.push(center(opts.storeName.slice(0, cols)))
  out.push(center(`PEDIDO #${order.id.slice(0, 8).toUpperCase()}`))
  out.push(center(new Date(order.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })))
  out.push(dash)

  const kind = order.source === 'mesa'
    ? `MESA ${opts.tableLabel || '?'}`
    : order.source === 'balcao'
      ? 'BALCAO'
      : order.order_type === 'pickup' ? 'RETIRADA' : 'ENTREGA'
  out.push(`>> ${kind}`)
  out.push(...wrap(`Cliente: ${order.customer_name}`, cols))
  if (order.customer_phone) out.push(`Tel: ${order.customer_phone}`)
  if (order.order_type === 'delivery' && order.delivery_address) {
    const a = order.delivery_address
    out.push(...wrap(`${a.street}, ${a.number}${a.complement ? ` - ${a.complement}` : ''}`, cols))
    out.push(...wrap(`${a.neighborhood}${a.reference ? ` (${a.reference})` : ''}`, cols))
  }
  if (order.eta_minutes) out.push(`Previsao: ${order.eta_minutes} min`)
  out.push(dash)

  for (const item of order.items) {
    out.push(line(`${item.quantity}x ${item.product_name}`.slice(0, cols - 9), money(item.total_price), cols))
    for (const v of item.variations || []) out.push(...wrap(`- ${v.option_name}`, cols, '  '))
    if (item.note) out.push(...wrap(`OBS: ${item.note}`, cols, '  '))
  }
  out.push(dash)
  out.push(line('Subtotal', money(order.subtotal), cols))
  if (order.discount && order.discount > 0) out.push(line(`Desconto${order.coupon_code ? ` ${order.coupon_code}` : ''}`, `-${money(order.discount)}`, cols))
  if (order.order_type === 'delivery') out.push(line('Entrega', money(order.shipping_fee || 0), cols))
  out.push(line('TOTAL', `R$ ${money(order.total)}`, cols))
  if (order.payment_method) {
    let pay = `Pagamento: ${paymentMethodLabel(order.payment_method)}`
    if (order.payment_method === 'mercadopago_pix') pay += order.payment_status === 'approved' ? ' (PAGO)' : ' (AGUARDANDO)'
    out.push(...wrap(pay, cols))
    if (order.payment_method === 'dinheiro' && order.change_for) {
      out.push(`Troco para R$ ${money(order.change_for)}: R$ ${money(order.change_for - order.total)}`)
    }
  }
  if (order.notes) {
    out.push(dash)
    out.push(...wrap(`OBS: ${order.notes}`, cols))
  }
  out.push('', '', '')
  return stripAccents(out.join('\n'))
}

// Link que abre o app RawBT (Android) e imprime o texto direto na
// térmica. Sem o app instalado, o Android oferece instalar pela loja.
export function rawbtPrintUrl(text: string): string {
  const base64 = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(text))) : Buffer.from(text, 'utf8').toString('base64')
  return `rawbt:base64,${base64}`
}
