// Contas do Financeiro e dos Relatórios num lugar só, para as duas telas
// (e o Início) chegarem sempre no mesmo número.
import type { Order, OrderItem } from '@/types'
import { paymentMethodLabel } from '@/lib/paymentMethods'
import { roundCents } from '@/lib/money'

export type Period = 'today' | 'week' | 'month' | 'custom'

/** Status que já contam como venda (o mesmo critério que lança no financeiro). */
export const SALE_STATUSES = ['confirmed', 'preparing', 'completed'] as const

/**
 * "2026-10-05" do <input type="date"> no fuso do aparelho. `new Date(str)`
 * lê como meia-noite UTC, que no Brasil vira o dia anterior às 21h e
 * deslocava o período personalizado inteiro um dia para trás.
 */
export function parseLocalDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '')
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/**
 * Início e fim do período no horário local. `week` é 'calendar' (desde
 * domingo, Financeiro) ou 'rolling' (últimos 7 dias, Relatórios).
 */
export function periodRange(
  period: Period,
  opts: { customStart?: string; customEnd?: string; week?: 'calendar' | 'rolling'; now?: Date } = {}
): { start: Date; end: Date } {
  const now = opts.now ? new Date(opts.now) : new Date()
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)

  if (period === 'week') {
    start.setDate(start.getDate() - (opts.week === 'rolling' ? 6 : now.getDay()))
  } else if (period === 'month') {
    start.setDate(1)
  } else if (period === 'custom') {
    const s = parseLocalDate(opts.customStart || '')
    const e = parseLocalDate(opts.customEnd || '')
    const from = s || new Date(start)
    const to = e || new Date(end)
    from.setHours(0, 0, 0, 0)
    to.setHours(23, 59, 59, 999)
    // Datas invertidas: troca em vez de mostrar um período vazio.
    return from <= to ? { start: from, end: to } : { start: new Date(to.setHours(0, 0, 0, 0)), end: new Date(from.setHours(23, 59, 59, 999)) }
  }
  return { start, end }
}

/**
 * Lê todas as linhas de uma consulta, de 1000 em 1000 (o limite padrão do
 * Supabase cortava o mês de lojas movimentadas sem avisar).
 */
export async function fetchAllRows<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < 1000) return out
  }
}

export type SaleOrder = Pick<Order, 'total' | 'subtotal' | 'discount' | 'shipping_fee' | 'source' | 'order_type'> & {
  payment_method?: string | null
  discount_source?: string | null
}

export interface Breakdown {
  label: string
  count: number
  amount: number
}

const DISCOUNT_LABELS: Record<string, string> = {
  coupon: 'Cupom',
  loyalty: 'Fidelidade',
  birthday: 'Aniversário',
  manual: 'Desconto no balcão',
}

export function channelLabel(o: Pick<SaleOrder, 'source' | 'order_type'>): string {
  if (o.source === 'mesa') return 'Mesa'
  if (o.source === 'balcao') return 'Balcão'
  return o.order_type === 'delivery' ? 'Entrega' : 'Retirada'
}

function group(orders: SaleOrder[], key: (o: SaleOrder) => string): Breakdown[] {
  const map = new Map<string, Breakdown>()
  for (const o of orders) {
    const label = key(o)
    const row = map.get(label) || { label, count: 0, amount: 0 }
    row.count++
    row.amount = roundCents(row.amount + Number(o.total || 0))
    map.set(label, row)
  }
  return Array.from(map.values()).sort((a, b) => b.amount - a.amount)
}

/**
 * Composição do faturamento: produtos − descontos + entrega = total.
 * Recebe só pedidos já aceitos (SALE_STATUSES).
 */
export function summarizeSales(orders: SaleOrder[]) {
  let products = 0
  let delivery = 0
  let discounts = 0
  let total = 0
  const discountMap = new Map<string, Breakdown>()
  for (const o of orders) {
    products += Number(o.subtotal || 0)
    delivery += Number(o.shipping_fee || 0)
    total += Number(o.total || 0)
    const d = Number(o.discount || 0)
    if (d > 0) {
      discounts += d
      const label = DISCOUNT_LABELS[o.discount_source || ''] || 'Outros descontos'
      const row = discountMap.get(label) || { label, count: 0, amount: 0 }
      row.count++
      row.amount = roundCents(row.amount + d)
      discountMap.set(label, row)
    }
  }
  return {
    count: orders.length,
    products: roundCents(products),
    delivery: roundCents(delivery),
    discounts: roundCents(discounts),
    total: roundCents(total),
    averageTicket: orders.length ? roundCents(total / orders.length) : 0,
    byPayment: group(orders, (o) => paymentMethodLabel(o.payment_method)),
    byChannel: group(orders, channelLabel),
    byDiscount: Array.from(discountMap.values()).sort((a, b) => b.amount - a.amount),
  }
}

export interface ProductStat {
  name: string
  quantity: number
  revenue: number
}

/**
 * Linhas de "mais vendidos" de um item. Pizza meio a meio conta meia
 * pizza para cada sabor (antes ia inteira para o primeiro sabor); combo
 * conta pelo nome do combo.
 */
export function itemStatLines(item: OrderItem): ProductStat[] {
  const quantity = Number(item.quantity || 0)
  const revenue = Number(item.total_price || 0)
  const flavors = item.combo_id ? [] : (item.variations || []).filter((v) => /^Sabor \(\d+\/\d+\)$/.test(v.group_name)).map((v) => v.option_name)
  if (flavors.length === 0) return [{ name: item.product_name, quantity, revenue }]
  return flavors.map((f) => ({
    name: /^pizza\b/i.test(f) ? f : `Pizza ${f}`,
    quantity: quantity / flavors.length,
    revenue: revenue / flavors.length,
  }))
}

export function rankProducts(items: OrderItem[], limit: number): ProductStat[] {
  const map = new Map<string, ProductStat>()
  for (const item of items) {
    for (const line of itemStatLines(item)) {
      const current = map.get(line.name) || { name: line.name, quantity: 0, revenue: 0 }
      current.quantity += line.quantity
      current.revenue += line.revenue
      map.set(line.name, current)
    }
  }
  return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue).slice(0, limit)
}

/** 3 · 1,5 (meio a meio deixa meias unidades). */
export function formatQty(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}
