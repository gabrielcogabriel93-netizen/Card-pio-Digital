import { describe, it, expect } from 'vitest'
import { buildWhatsAppOrderMessage } from './whatsappOrderMessage'

const base = {
  storeName: 'Bella Massa',
  orderId: 'abcdef12-0000-0000-0000-000000000000',
  customerName: 'Ana',
  customerPhone: '(11) 98888-7777',
  orderType: 'delivery' as const,
  address: { street: 'Rua A', number: '10', neighborhood: 'Centro', complement: 'Ap 2', reference: undefined, zip_code: undefined },
  items: [
    {
      product_id: 'p1',
      product_name: 'X-Burger',
      quantity: 2,
      unit_price: 24,
      total_price: 48,
      variations: [{ group_name: 'Extras', option_name: 'Bacon', price_delta: 4 }],
      note: 'sem cebola',
    },
  ],
  subtotal: 48,
  discount: 4.8,
  shippingFee: 5,
  total: 48.2,
  discountLabel: 'DEZ',
  paymentMethod: 'dinheiro',
  changeFor: 100,
  notes: 'Portão azul',
  trackingUrl: 'https://bella.fregues.app/pedido/abc',
}

describe('buildWhatsAppOrderMessage', () => {
  it('uses the server values and includes everything the store needs', () => {
    const msg = buildWhatsAppOrderMessage(base)
    expect(msg).toContain('#abcdef12')
    expect(msg).toContain('Rua A, 10 - Ap 2 - Centro')
    expect(msg).toContain('- Extras: Bacon (+R$ 4,00)')
    expect(msg).toContain('📝 sem cebola')
    expect(msg).toContain('2 x R$ 24,00 = R$ 48,00')
    expect(msg).toContain('Desconto (DEZ): -R$ 4,80')
    expect(msg).toContain('*Total: R$ 48,20*')
    expect(msg).toContain('Dinheiro (troco para R$ 100,00)')
    expect(msg).toContain('Portão azul')
    expect(msg.trim().endsWith('https://bella.fregues.app/pedido/abc')).toBe(true)
  })

  it('omits address for pickup and shows free delivery when the fee is zero', () => {
    expect(buildWhatsAppOrderMessage({ ...base, orderType: 'pickup' })).not.toContain('Endereço')
    expect(buildWhatsAppOrderMessage({ ...base, shippingFee: 0 })).toContain('Entrega grátis')
  })
})
