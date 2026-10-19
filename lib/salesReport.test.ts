import { describe, it, expect } from 'vitest'
import { parseLocalDate, periodRange, summarizeSales, rankProducts, itemStatLines, fetchAllRows, formatQty } from './salesReport'
import type { OrderItem } from '@/types'

describe('periodRange', () => {
  it('período personalizado usa o dia escolhido no fuso local', () => {
    const { start, end } = periodRange('custom', { customStart: '2026-10-05', customEnd: '2026-10-07' })
    expect([start.getFullYear(), start.getMonth(), start.getDate(), start.getHours()]).toEqual([2026, 9, 5, 0])
    expect([end.getDate(), end.getHours(), end.getMinutes()]).toEqual([7, 23, 59])
  })

  it('datas invertidas viram o período certo', () => {
    const { start, end } = periodRange('custom', { customStart: '2026-10-07', customEnd: '2026-10-05' })
    expect(start.getDate()).toBe(5)
    expect(end.getDate()).toBe(7)
  })

  it('semana do Financeiro começa no domingo; a dos Relatórios são os últimos 7 dias', () => {
    const now = new Date(2026, 9, 21, 15) // quarta
    expect(periodRange('week', { now, week: 'calendar' }).start.getDate()).toBe(18)
    expect(periodRange('week', { now, week: 'rolling' }).start.getDate()).toBe(15)
    expect(periodRange('month', { now }).start.getDate()).toBe(1)
  })

  it('parseLocalDate rejeita texto inválido', () => {
    expect(parseLocalDate('')).toBeNull()
    expect(parseLocalDate('05/10/2026')).toBeNull()
  })
})

describe('summarizeSales', () => {
  it('produtos − descontos + entrega fecha com o total', () => {
    const s = summarizeSales([
      { subtotal: 72.9, discount: 0, shipping_fee: 8, total: 80.9, payment_method: 'pix', source: 'online', order_type: 'delivery' },
      { subtotal: 50, discount: 7.5, shipping_fee: 0, total: 42.5, payment_method: 'dinheiro', source: 'online', order_type: 'pickup', discount_source: 'coupon' },
      { subtotal: 30, discount: 5, shipping_fee: 0, total: 25, payment_method: 'dinheiro', source: 'balcao', order_type: 'pickup', discount_source: 'manual' },
      { subtotal: 20, discount: 0, shipping_fee: 0, total: 20, payment_method: undefined, source: 'mesa', order_type: 'mesa' },
    ])
    expect(s.total).toBe(168.4)
    expect(s.products - s.discounts + s.delivery).toBeCloseTo(s.total, 2)
    expect(s.delivery).toBe(8)
    expect(s.discounts).toBe(12.5)
    expect(s.byDiscount.map((d) => d.label)).toEqual(['Cupom', 'Desconto no balcão'])
    expect(s.byPayment.find((p) => p.label === 'Dinheiro')).toEqual({ label: 'Dinheiro', count: 2, amount: 67.5 })
    expect(s.byPayment.some((p) => p.label === 'Não informado')).toBe(true)
    expect(s.byChannel.map((c) => c.label).sort()).toEqual(['Balcão', 'Entrega', 'Mesa', 'Retirada'])
    expect(s.averageTicket).toBe(42.1)
  })

  it('sem pedidos dá zero, sem dividir por zero', () => {
    expect(summarizeSales([]).averageTicket).toBe(0)
  })
})

describe('mais vendidos', () => {
  const pizza = (flavors: string[], total: number, qty = 1): OrderItem => ({
    product_id: 'p', product_name: 'Pizza ' + flavors[0], quantity: qty, unit_price: total / qty, total_price: total,
    variations: [{ group_name: 'Tamanho', option_name: 'Grande', price_delta: 0 },
      ...flavors.map((f, i) => ({ group_name: `Sabor (${i + 1}/${flavors.length})`, option_name: f, price_delta: 0 }))],
  })

  it('meio a meio divide a pizza entre os sabores', () => {
    expect(itemStatLines(pizza(['Calabresa', 'Frango com Catupiry'], 60))).toEqual([
      { name: 'Pizza Calabresa', quantity: 0.5, revenue: 30 },
      { name: 'Pizza Frango com Catupiry', quantity: 0.5, revenue: 30 },
    ])
  })

  it('soma sabores de pizzas inteiras e meio a meio; combo conta pelo nome', () => {
    const combo: OrderItem = { product_id: 'c', product_name: 'Combo Casal', quantity: 1, unit_price: 64.9, total_price: 64.9, combo_id: 'c',
      variations: [{ group_name: 'Pizza média', option_name: 'Pizza Calabresa', price_delta: 0 }] }
    const ranking = rankProducts([pizza(['Calabresa'], 50), pizza(['Calabresa', 'Portuguesa'], 60), combo], 10)
    expect(ranking[0]).toEqual({ name: 'Pizza Calabresa', quantity: 1.5, revenue: 80 })
    expect(ranking.map((r) => r.name)).toContain('Combo Casal')
    expect(formatQty(1.5)).toBe('1,5')
    expect(formatQty(3)).toBe('3')
  })
})

describe('fetchAllRows', () => {
  it('busca de 1000 em 1000 até a última página', async () => {
    const rows = Array.from({ length: 2350 }, (_, i) => i)
    const calls: number[] = []
    const all = await fetchAllRows<number>(async (from, to) => {
      calls.push(from)
      return { data: rows.slice(from, to + 1), error: null }
    })
    expect(all).toHaveLength(2350)
    expect(calls).toEqual([0, 1000, 2000])
  })
})
