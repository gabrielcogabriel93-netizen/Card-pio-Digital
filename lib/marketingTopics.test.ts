import { describe, it, expect } from 'vitest'
import { buildTopics, pickTopic, freeTopicText, shortName, couponBenefit, type TopicData } from './marketingTopics'

const NOW = new Date('2026-10-28T15:00:00Z')
const base: TopicData = {
  coupons: [], reviews: [], ratingAvg: null, ratingCount: 0,
  loyalty: { active: false, pointsPerReal: null, rewards: [] },
  birthdayPercent: null, freeShippingThreshold: null, freeDelivery: false,
  combos: [], newProducts: [], ordersTotal: 0, ordersTotal14dAgo: 0, appDevices: 0, hasProducts: true,
}

describe('temas das postagens', () => {
  it('só cria tema do que a loja tem de verdade', () => {
    const kinds = buildTopics(base, NOW).map((t) => t.kind)
    expect(kinds.sort()).toEqual(['app', 'produto'])
  })

  it('cupom vencido, esgotado ou inativo não vira post', () => {
    const t = buildTopics({ ...base, coupons: [
      { code: 'OK10', discount_type: 'percent', discount_value: 10, expires_at: null, max_uses: null, used_count: 0 },
      { code: 'VENCEU', discount_type: 'percent', discount_value: 10, expires_at: '2026-10-01T00:00:00Z', max_uses: null, used_count: 0 },
      { code: 'ACABOU', discount_type: 'fixed', discount_value: 5, expires_at: null, max_uses: 3, used_count: 3 },
    ] }, NOW).filter((x) => x.kind === 'cupom')
    expect(t.map((x) => x.facts.codigo)).toEqual(['OK10'])
    expect(couponBenefit({ discount_type: 'fixed', discount_value: 5 })).toBe('R$ 5,00 de desconto')
    expect(couponBenefit({ discount_type: 'free_shipping', discount_value: 0 })).toBe('entrega grátis')
  })

  it('avaliação usa só primeiro nome e inicial, e ignora nota baixa ou texto vazio', () => {
    const t = buildTopics({ ...base, reviews: [
      { id: 'r1', customer_name: 'mariana lopes da silva', customer_rating: 5, customer_review: 'Melhor pizza da cidade, chegou quentinha!', created_at: '' },
      { id: 'r2', customer_name: 'João', customer_rating: 3, customer_review: 'Demorou um pouco para chegar', created_at: '' },
      { id: 'r3', customer_name: 'Ana', customer_rating: 5, customer_review: 'Top', created_at: '' },
    ] }, NOW).filter((x) => x.kind === 'avaliacao')
    expect(t).toHaveLength(1)
    expect(t[0].facts.cliente).toBe('Mariana S.')
    expect(shortName('')).toBe('Cliente')
    const text = freeTopicText(t[0], 'Pizzaria X')
    expect(text.caption).toContain('“Melhor pizza da cidade, chegou quentinha!”')
    expect(text.caption).not.toContain('lopes')
    expect(text.highlight).toBe('★★★★★')
  })

  it('marco de pedidos só quando foi alcançado nos últimos 14 dias', () => {
    expect(buildTopics({ ...base, ordersTotal: 104, ordersTotal14dAgo: 96 }, NOW).find((t) => t.kind === 'marco')?.facts.pedidos).toBe(100)
    expect(buildTopics({ ...base, ordersTotal: 140, ordersTotal14dAgo: 120 }, NOW).find((t) => t.kind === 'marco')).toBeUndefined()
  })

  it('nota da loja só com 10+ avaliações e média 4,5+', () => {
    expect(buildTopics({ ...base, ratingAvg: 4.8, ratingCount: 9 }, NOW).some((t) => t.kind === 'nota')).toBe(false)
    expect(buildTopics({ ...base, ratingAvg: 4.8, ratingCount: 12 }, NOW).some((t) => t.kind === 'nota')).toBe(true)
    expect(buildTopics({ ...base, ratingAvg: 4.2, ratingCount: 50 }, NOW).some((t) => t.kind === 'nota')).toBe(false)
  })

  it('não repete o tipo das últimas 2 sugestões nem o mesmo cupom', () => {
    const topics = buildTopics({ ...base, coupons: [{ code: 'A', discount_type: 'percent', discount_value: 10, expires_at: null, max_uses: null, used_count: 0 }], freeDelivery: true }, NOW)
    for (let i = 0; i < 30; i++) {
      const t = pickTopic(topics, [{ topic: 'cupom', topic_key: 'cupom:A' }, { topic: 'frete', topic_key: 'frete' }], `dia:${i}`)
      expect(t && ['cupom', 'frete']).not.toContain(t!.kind)
    }
    // mesmo dia e mesma variação = mesmo tema
    expect(pickTopic(topics, [], 'x')?.key).toBe(pickTopic(topics, [], 'x')?.key)
  })

  it('textos sem travessão e com o que foi cadastrado', () => {
    const topics = buildTopics({ ...base, freeShippingThreshold: 80, birthdayPercent: 10,
      loyalty: { active: true, pointsPerReal: 1, rewards: [{ name: 'Refri grátis', points_cost: 100 }] },
      combos: [{ id: 'c', name: 'Combo Casal', price: 64.9, image_url: null, description: null }] }, NOW)
    for (const t of topics) {
      const text = freeTopicText(t, 'Loja X')
      expect(text.caption).not.toMatch(/[—–]/)
      expect(text.headline.length).toBeLessThanOrEqual(48)
      expect(text.push_title.length).toBeLessThanOrEqual(60)
    }
    const frete = freeTopicText(topics.find((t) => t.kind === 'frete')!, 'Loja X')
    expect(frete.subline).toContain('R$ 80,00')
  })
})
