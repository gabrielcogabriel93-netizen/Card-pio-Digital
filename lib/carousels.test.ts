import { describe, it, expect } from 'vitest'

import { buildCarousels, couponBenefitText, hashtagOf, type CarouselInput } from './carousels'

// O formato de dinheiro usa espaço não separável entre "R$" e o valor.
const sp = (t: unknown) => (typeof t === 'string' ? t.replace(/ /g, ' ') : t)

const base: CarouselInput = {
  storeName: 'Mega Massa', offersDelivery: true, offersPickup: true, freeShippingThreshold: null,
  products: [
    { id: 'a', name: 'Calabresa', price: 49.9, qty30: 30 },
    { id: 'b', name: 'Portuguesa', price: 54.9, qty30: 12 },
    { id: 'c', name: 'Marguerita', price: 41.9, originalPrice: 46.9, qty30: 3 },
  ],
  combos: [], coupons: [], loyalty: null,
}

describe('carrosséis', () => {
  it('monta só o que a loja tem, e sempre o "peça direto"', () => {
    const kinds = buildCarousels(base).map((c) => c.kind)
    expect(kinds).toEqual(['ofertas', 'mais-pedidos', 'sem-taxa'])
    const withAll = buildCarousels({ ...base, coupons: [{ code: 'BLACK15', discount_type: 'percent', discount_value: 15, expires_at: '2099-11-28T03:00:00Z', max_uses_per_customer: 1 }], loyalty: { pointsPerReal: 1, rewards: [{ name: 'Refri grátis', points: 100 }] }, occasion: { name: 'Black Friday', date: '2026-11-27', daysUntil: 6 } })
    expect(withAll.map((c) => c.kind)).toEqual(['data', 'ofertas', 'cupom', 'mais-pedidos', 'fidelidade', 'sem-taxa'])
  })

  it('mais pedidos em ordem de venda, com capa e chamada final', () => {
    const c = buildCarousels(base).find((x) => x.kind === 'mais-pedidos')!
    expect(c.slides[0].type).toBe('cover')
    expect(c.slides.at(-1)!.type).toBe('cta')
    expect(c.slides.filter((s) => s.type === 'product').map((s) => s.type === 'product' && s.name)).toEqual(['Calabresa', 'Portuguesa', 'Marguerita'])
    expect(c.caption).toMatch(/1\. Calabresa/)
    expect(c.caption).toMatch(/#megamassa/)
  })

  it('oferta mostra de/por e o desconto', () => {
    const c = buildCarousels(base).find((x) => x.kind === 'ofertas')!
    const s = c.slides[1]
    expect(s.type === 'product' && [s.oldPrice, s.price, s.badge].map(sp)).toEqual(['R$ 46,90', 'R$ 41,90', '-11%'])
    expect(sp(c.caption)).toMatch(/de R\$ 46,90 por R\$ 41,90/)
  })

  it('cupom vencido não entra; texto do benefício', () => {
    expect(buildCarousels({ ...base, coupons: [{ code: 'VELHO', discount_type: 'fixed', discount_value: 5, expires_at: '2000-01-01T00:00:00Z' }] }).some((c) => c.kind === 'cupom')).toBe(false)
    expect(couponBenefitText({ code: 'X', discount_type: 'free_shipping', discount_value: 0 })).toBe('Entrega grátis')
    expect(sp(couponBenefitText({ code: 'X', discount_type: 'fixed', discount_value: 5 }))).toBe('R$ 5,00 de desconto')
  })

  it('hashtag da loja sem acento nem espaço; no máximo 5 hashtags', () => {
    expect(hashtagOf('Restaurante do Picolé')).toBe('#restaurantedopicole')
    for (const c of buildCarousels(base)) expect((c.caption.match(/#\w+/g) || []).length).toBeLessThanOrEqual(5)
  })
})
