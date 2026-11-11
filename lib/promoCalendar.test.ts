import { describe, it, expect } from 'vitest'
import { easterDate, endOfLocalDay, localDate, nthWeekday, occasionsOf, upcomingOccasions } from './promoCalendar'
import { buildPromotions, type StrategyInput, type StrategyProduct } from './promoStrategist'

const date = (year: number, id: string) => occasionsOf(year).find((o) => o.id === id)!.date

describe('calendário', () => {
  it('datas móveis', () => {
    expect(easterDate(2026)).toBe('2026-04-05')
    expect(easterDate(2027)).toBe('2027-03-28')
    expect(date(2026, 'carnaval')).toBe('2026-02-17')
    expect(date(2026, 'maes')).toBe('2026-05-10')
    expect(date(2027, 'maes')).toBe('2027-05-09')
    expect(date(2026, 'pais')).toBe('2026-08-09')
    expect(date(2026, 'blackfriday')).toBe('2026-11-27')
    expect(nthWeekday(2027, 11, 4, 4)).toBe('2027-11-25')
  })

  it('janela de antecedência, inclusive virando o ano', () => {
    expect(upcomingOccasions('2026-11-11').map((o) => o.id)).toEqual(['blackfriday'])
    expect(upcomingOccasions('2026-12-24').map((o) => o.id)).toEqual(['natal', 'reveillon'])
    expect(upcomingOccasions('2027-04-20').map((o) => o.id)).toEqual(['maes'])
    expect(upcomingOccasions('2026-05-11').some((o) => o.id === 'maes')).toBe(false)
  })

  it('fuso da loja', () => {
    expect(localDate(new Date('2026-11-12T02:00:00Z'), 'America/Sao_Paulo')).toBe('2026-11-11')
    expect(endOfLocalDay('2026-11-27', 'America/Sao_Paulo')).toBe('2026-11-28T03:00:00.000Z')
  })
})

const prod = (o: Partial<StrategyProduct>): StrategyProduct => ({ id: 'p', name: 'Prato', price: 15, has_options: false, qty30: 0, revenue30: 0, ...o })
const base: StrategyInput = {
  storeName: 'Loja', products: [prod({ has_options: true })], orders30: 0, avgTicket: null, weekdayOrders: [0, 0, 0, 0, 0, 0, 0],
  deliveryFee: 4, freeShippingThreshold: null, offersDelivery: true, existingCouponCodes: [], activeKeys: [], weekKey: '2026-11-09', timezone: 'America/Sao_Paulo',
}

describe('sugestões por data comemorativa', () => {
  it('Dia das Mães vira cupom no topo, valendo até o fim do domingo', () => {
    const s = buildPromotions({ ...base, today: '2027-04-28' })
    expect(s[0].key).toBe('data:maes:2027')
    expect(s[0].occasion).toEqual({ name: 'Dia das Mães', date: '2027-05-09', daysUntil: 11 })
    expect(s[0].endsAt).toBe('2027-05-10T03:00:00.000Z')
    if (s[0].apply.kind !== 'cupom') throw new Error('tipo')
    expect(s[0].apply.code).toBe('MAES10')
    expect(s[0].banner.link_type).toBe('cupom')
  })

  it('Namorados com pratos sem opções vira combo para 2', () => {
    const s = buildPromotions({ ...base, today: '2027-06-05', products: [
      prod({ id: 'a', name: 'Hambúrguer', price: 25, qty30: 9 }), prod({ id: 'b', name: 'Pizza', price: 40, qty30: 5 }), prod({ id: 'r', name: 'Refrigerante', price: 6, category: 'Bebidas' }),
    ] })
    const n = s.find((x) => x.key === 'data:namorados:2027')!
    expect(n.kind).toBe('combo')
    if (n.apply.kind !== 'combo') throw new Error('tipo')
    expect(n.apply.product_ids).toEqual(['a', 'b', 'r'])
  })

  it('Dia da Pizza só para quem vende pizza; data aplicada não repete', () => {
    expect(buildPromotions({ ...base, today: '2027-07-08' }).some((x) => x.key === 'data:pizza:2027')).toBe(false)
    expect(buildPromotions({ ...base, today: '2027-07-08', products: [prod({ name: 'Pizza calabresa' })] }).some((x) => x.key === 'data:pizza:2027')).toBe(true)
    expect(buildPromotions({ ...base, today: '2026-11-11', activeKeys: ['data:blackfriday:2026'] }).some((x) => x.occasion)).toBe(false)
  })

  it('sem data informada, nenhuma sugestão de data', () => {
    expect(buildPromotions(base).some((x) => x.occasion)).toBe(false)
  })
})
