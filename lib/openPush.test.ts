import { describe, expect, it } from 'vitest'
import { buildOpenPushMessage } from './openPushMessage'
import { isOpeningMoment } from './openPush'

const products = [
  { id: 'a', name: 'Pizza Calabresa', price: 49.9, image_url: 'https://x/a.jpg' },
  { id: 'b', name: 'Coca 2L', price: 14, image_url: null },
  { id: 'c', name: 'X-Bacon', price: 32, image_url: 'https://x/c.jpg' },
]
const store = { name: 'Mega Massa' }

describe('buildOpenPushMessage', () => {
  it('automático usa só nome, preço e foto do cardápio, sem inventar promoção', () => {
    for (let d = 1; d <= 20; d++) {
      const m = buildOpenPushMessage(store, products, `2026-10-${String(d).padStart(2, '0')}`)
      expect(m.body + m.title).not.toMatch(/promo|desconto|grátis|gratis|% ?off|brinde|cupom|metade do preço/i)
      const p = products.find((x) => x.id === m.productId)!
      expect(p).toBeTruthy()
      expect(p.image_url).toBeTruthy() // prefere produto com foto
      expect(m.body).toContain(p.name)
      expect(m.body).toContain(String(p.price).replace('.', ','))
    }
  })

  it('varia o produto ao longo dos dias', () => {
    const ids = new Set(Array.from({ length: 10 }, (_, i) => buildOpenPushMessage(store, products, `2026-11-${i + 10}`).productId))
    expect(ids.size).toBeGreaterThan(1)
  })

  it('mensagem do lojista sai exatamente como ele escreveu', () => {
    const m = buildOpenPushMessage({ ...store, open_push_mode: 'custom', open_push_title: 'Abrimos!', open_push_body: 'Rodízio hoje até 23h.' }, products, '2026-10-19', 'c')
    expect(m).toEqual({ title: 'Abrimos!', body: 'Rodízio hoje até 23h.', productId: 'c', image: 'https://x/c.jpg' })
  })

  it('modo próprio sem texto cai no automático; sem produtos chama para o cardápio', () => {
    expect(buildOpenPushMessage({ ...store, open_push_mode: 'custom' }, products, '2026-10-19').productId).toBeTruthy()
    const empty = buildOpenPushMessage(store, [], '2026-10-19')
    expect(empty.productId).toBeNull()
    expect(empty.body).toMatch(/cardápio/)
  })
})

describe('isOpeningMoment', () => {
  const hours = Object.fromEntries(['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'].map((d) => [d, { open: '18:00', close: '23:30' }]))
  const base = { is_open: true, paused_until: null, opening_hours: hours, timezone: 'America/Sao_Paulo', opened_at: null }
  // 2026-10-19 é segunda; São Paulo = UTC-3.
  const at = (hhmm: string) => new Date(`2026-10-19T${hhmm}:00-03:00`)

  it('dispara logo depois do horário de abertura', () => {
    expect(isOpeningMoment(base, at('18:05'))).toBe(true)
    expect(isOpeningMoment(base, at('18:44'))).toBe(true)
    expect(isOpeningMoment(base, at('19:30'))).toBe(false)
    expect(isOpeningMoment(base, at('17:55'))).toBe(false)
  })

  it('dispara quando o lojista liga "Aberta" (dentro do horário)', () => {
    expect(isOpeningMoment({ ...base, opened_at: at('20:00').toISOString() }, at('20:10'))).toBe(true)
  })

  it('não dispara com a loja fechada, pausada ou de madrugada', () => {
    expect(isOpeningMoment({ ...base, is_open: false }, at('18:05'))).toBe(false)
    expect(isOpeningMoment({ ...base, paused_until: at('19:00').toISOString() }, at('18:05'))).toBe(false)
    const allDay = Object.fromEntries(Object.keys(hours).map((d) => [d, { open: '00:00', close: '23:59' }]))
    expect(isOpeningMoment({ ...base, opening_hours: allDay }, at('00:10'))).toBe(false)
    expect(isOpeningMoment({ ...base, opening_hours: allDay, opened_at: at('03:00').toISOString() }, at('03:05'))).toBe(false)
  })
})
