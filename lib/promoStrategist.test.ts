import { describe, it, expect } from 'vitest'
import { buildPromotions, breakEvenLift, charmPrice, costOf, weekKeyOf, type StrategyInput, type StrategyProduct } from './promoStrategist'

const prod = (o: Partial<StrategyProduct>): StrategyProduct => ({ id: 'p', name: 'Prato', price: 15, has_options: false, qty30: 0, revenue30: 0, ...o })
const base: StrategyInput = {
  storeName: 'Loja', products: [], orders30: 0, avgTicket: null, weekdayOrders: [0, 0, 0, 0, 0, 0, 0],
  deliveryFee: 4, freeShippingThreshold: null, offersDelivery: true, existingCouponCodes: [], activeKeys: [], weekKey: '2026-11-09',
}

describe('contas da promoção', () => {
  it('preço quebrado e custo estimado', () => {
    expect(charmPrice(13.5)).toBe(13.9)
    expect(charmPrice(12.75)).toBe(12.9)
    expect(charmPrice(13.95)).toBe(13.9)
    expect(costOf({ price: 20, cost_price: null })).toEqual({ cost: 7, assumed: true })
    expect(costOf({ price: 20, cost_price: 8 })).toEqual({ cost: 8, assumed: false })
  })

  it('quanto precisa vender a mais para empatar', () => {
    // margem 9 -> 7: precisa vender 9/7 = 1,2857 -> +28,6%
    expect(breakEvenLift(15, 6, 13)).toBeCloseTo(0.2857, 3)
    expect(breakEvenLift(10, 9, 8)).toBeNull()
  })
})

describe('sugestões', () => {
  it('marmita com tamanho: oferta de preço, frete e cupom; nada de combo', () => {
    const s = buildPromotions({ ...base, products: [prod({ id: 'a', name: 'Feijoada', price: 18, has_options: true }), prod({ id: 'b', name: 'Bife', price: 15, has_options: true })] })
    const kinds = s.map((x) => x.kind)
    expect(kinds).toContain('preco')
    expect(kinds).toContain('frete')
    expect(kinds).toContain('cupom')
    expect(kinds).not.toContain('combo')
    const preco = s.find((x) => x.kind === 'preco')!
    expect(preco.apply.kind === 'preco' && preco.apply.promo_price < 18).toBe(true)
    expect(preco.why.join(' ')).toMatch(/precisa|basta vender/)
    expect(preco.banner.link_type).toBe('produto')
  })

  it('combo com bebida quando há itens sem opções, com lucro maior que o prato sozinho', () => {
    const s = buildPromotions({ ...base, products: [
      prod({ id: 'm', name: 'Hambúrguer', price: 25, qty30: 30 }),
      prod({ id: 'r', name: 'Refrigerante lata', price: 6, category: 'Bebidas' }),
    ] })
    const combo = s.find((x) => x.kind === 'combo')!
    expect(combo).toBeTruthy()
    if (combo.apply.kind !== 'combo') throw new Error('tipo')
    expect(combo.apply.product_ids).toEqual(['m', 'r'])
    expect(combo.apply.price).toBeLessThan(31)
  })

  it('frete grátis: limite acima do ticket, cobrindo a entrega', () => {
    const s = buildPromotions({ ...base, orders30: 20, avgTicket: 20, products: [prod({ price: 15 })] })
    const f = s.find((x) => x.kind === 'frete')!
    if (f.apply.kind !== 'frete') throw new Error('tipo')
    expect(f.apply.threshold).toBe(30)
    expect(buildPromotions({ ...base, freeShippingThreshold: 50, products: [prod({})] }).some((x) => x.kind === 'frete')).toBe(false)
  })

  it('dia fraco vira cupom; código não repete os existentes; não repete promoção ativa', () => {
    const s = buildPromotions({ ...base, orders30: 40, avgTicket: 25, weekdayOrders: [8, 2, 6, 6, 7, 9, 10], existingCouponCodes: ['BEMVINDO10'], products: [prod({})] })
    const dia = s.find((x) => x.key === 'cupom:dia:1')!
    expect(dia.title).toMatch(/Segunda/)
    const welcome = s.find((x) => x.key === 'cupom:boas-vindas')!
    if (welcome.apply.kind !== 'cupom') throw new Error('tipo')
    expect(welcome.apply.code).toBe('BEMVINDO102')
    const again = buildPromotions({ ...base, orders30: 40, avgTicket: 25, weekdayOrders: [8, 2, 6, 6, 7, 9, 10], activeKeys: ['cupom:boas-vindas'], products: [prod({})] })
    expect(again.some((x) => x.key === 'cupom:boas-vindas')).toBe(false)
  })

  it('mesma semana, mesma ordem; semana muda para segunda-feira', () => {
    const input = { ...base, products: [prod({ id: 'a' }), prod({ id: 'b', name: 'Outro', price: 20 })] }
    expect(buildPromotions(input).map((x) => x.key)).toEqual(buildPromotions(input).map((x) => x.key))
    expect(weekKeyOf(new Date('2026-11-12T12:00:00'))).toBe('2026-11-09')
  })
})

describe('variedade', () => {
  it('as primeiras sugestões são de tipos diferentes', () => {
    const s = buildPromotions({ ...base, products: [prod({ id: 'a', price: 15, has_options: true }), prod({ id: 'b', name: 'B', price: 15, has_options: true }), prod({ id: 'c', name: 'C', price: 15, has_options: true })] })
    const top3 = s.slice(0, 3).map((x) => x.kind)
    expect(new Set(top3).size).toBe(3)
  })
})
