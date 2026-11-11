import { describe, it, expect } from 'vitest'
import { buildReceiptText, rawbtPrintUrl, receiptPrintStyle } from './receipt'
import type { Order } from '@/types'

const order: Order = {
  id: 'abcdef12-3456-0000-0000-000000000000',
  establishment_id: 'e1',
  customer_name: 'João da Silva',
  customer_phone: '(11) 98888-7777',
  items: [
    { product_id: 'p1', product_name: 'Pizza Calabresa Grande', quantity: 1, unit_price: 62, total_price: 62, variations: [{ group_name: 'Tamanho', option_name: 'Grande', price_delta: 0 }], note: 'sem cebola' },
  ],
  subtotal: 62,
  shipping_fee: 5,
  discount: 0,
  total: 67,
  status: 'confirmed',
  source: 'online',
  order_type: 'delivery',
  delivery_address: { street: 'Rua das Flores', number: '120', neighborhood: 'Centro' },
  payment_method: 'dinheiro',
  change_for: 100,
  eta_minutes: 35,
  created_at: '2026-10-16T22:00:00Z',
  updated_at: '2026-10-16T22:00:00Z',
}

describe('buildReceiptText', () => {
  it('fits a 58mm printer (32 columns) and has no accents', () => {
    const text = buildReceiptText(order, { storeName: 'Bella Massa', width: 58 })
    for (const l of text.split('\n')) expect(l.length).toBeLessThanOrEqual(32)
    expect(text).not.toMatch(/[ãçõé]/)
    expect(text).toContain('Joao da Silva')
  })

  it('includes what the kitchen and the driver need', () => {
    const text = buildReceiptText(order, { storeName: 'Bella Massa', width: 80 })
    expect(text).toContain('PEDIDO #ABCDEF12')
    expect(text).toContain('>> ENTREGA')
    expect(text).toContain('Rua das Flores, 120')
    expect(text).toContain('OBS: sem cebola')
    expect(text).toContain('Previsao: 35 min')
    expect(text).toContain('Troco para R$ 100,00: R$ 33,00')
    expect(text).toMatch(/TOTAL\s+R\$ 67,00/)
  })

  it('labels table orders', () => {
    const text = buildReceiptText({ ...order, source: 'mesa', order_type: 'mesa' }, { storeName: 'X', width: 80, tableLabel: '7' })
    expect(text).toContain('>> MESA 7')
  })
})

describe('rawbtPrintUrl', () => {
  it('encodes the text as base64 for the RawBT app', () => {
    const url = rawbtPrintUrl('Olá')
    expect(url.startsWith('rawbt:base64,')).toBe(true)
    expect(Buffer.from(url.slice('rawbt:base64,'.length), 'base64').toString('utf8')).toBe('Olá')
  })
})

describe('cabe no papel', () => {
  it('nenhuma linha passa das colunas e a letra cabe na largura impressa', () => {
    const long = { ...order, customer_name: 'Maria Aparecida dos Santos Oliveira Pereira', items: [{ ...order.items[0], product_name: 'Marmita G - Filé de frango à milanesa com fritas e salada completa', quantity: 12, total_price: 1234.5 }], notes: 'Entregar no portão dos fundos, tocar a campainha duas vezes e esperar' }
    for (const [width, cols, mm] of [[80, 48, 72], [58, 32, 48]] as const) {
      const lines = buildReceiptText(long, { storeName: 'Restaurante com um nome bem comprido demais', width }).split('\n')
      expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(cols)
      const s = receiptPrintStyle(width)
      expect(s.box.width).toBe(`${mm}mm`)
      expect(cols * 0.6 * parseFloat(s.text.fontSize)).toBeLessThanOrEqual(mm)
    }
  })
})

describe('nome comprido', () => {
  it('quebra o nome em linhas e mantém o valor alinhado', () => {
    const text = buildReceiptText({ ...order, items: [{ ...order.items[0], product_name: 'Refrigerante lata 350 ml', quantity: 2, total_price: 12, variations: [], note: undefined }] }, { storeName: 'L', width: 58 })
    expect(text).toContain('2x Refrigerante lata')
    expect(text).toMatch(/350 ml\s+12,00/)
  })
})
