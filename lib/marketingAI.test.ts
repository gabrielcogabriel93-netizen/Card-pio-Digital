import { describe, expect, it, vi } from 'vitest'
import { freeSuggestion, generateSuggestion, pickCandidates, type SuggestionInput } from './marketingAI'

vi.mock('@/lib/logger', () => ({ logWarning: vi.fn(), logError: vi.fn() }))

const products = [
  { id: 'a', name: 'X-Bacon Artesanal', description: 'Pão brioche — bacon crocante e cheddar', price: 32.9, image_url: 'https://x/a.jpg', category: 'Lanches' },
  { id: 'b', name: 'Batata Rústica', description: null, price: 18, image_url: 'https://x/b.jpg', category: 'Porções' },
  { id: 'c', name: 'Refrigerante lata', price: 6, image_url: null, category: 'Bebidas' },
  { id: 'd', name: 'Pizza Calabresa', price: 49.9, image_url: 'https://x/d.jpg', category: 'Pizzas', is_featured: true },
]
const base: SuggestionInput = { storeName: 'Mega Massa', products, recentProductIds: [], timeZone: 'America/Sao_Paulo', now: new Date('2026-10-16T15:00:00Z') }

describe('pickCandidates', () => {
  it('prefere produto com foto e muda de um dia para o outro', () => {
    const days = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17']
    const picks = days.map((d) => pickCandidates({ ...base, now: new Date(`${d}T15:00:00Z`) }, 1)[0].id)
    expect(picks.every((id) => id !== 'c')).toBe(true)
    expect(new Set(picks).size).toBeGreaterThan(1)
  })

  it('evita repetir o produto dos últimos dias', () => {
    const first = pickCandidates(base, 1)[0].id
    const next = pickCandidates({ ...base, recentProductIds: [first] }, 1)[0].id
    expect(next).not.toBe(first)
  })
})

describe('freeSuggestion', () => {
  it('monta post e notificação dentro dos limites, sem travessão', () => {
    const s = freeSuggestion(base, products[0])
    expect(s.provider).toBe('fregues')
    expect(s.product_ids).toEqual(['a'])
    expect(s.headline.length).toBeLessThanOrEqual(42)
    expect(s.push_title.length).toBeLessThanOrEqual(55)
    expect(s.push_body).toContain('32,90')
    expect(s.caption).not.toMatch(/[—–]/)
    expect(s.hashtags.every((h) => /^#[a-z0-9]+$/.test(h))).toBe(true)
    expect(s.hashtags).toContain('#megamassa')
    // sexta-feira em São Paulo
    expect(s.headline + s.caption).toMatch(/Sext|fim de semana/i)
  })
})

describe('generateSuggestion', () => {
  it('sem chave de IA usa o gerador próprio', async () => {
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.GEMINI_API_KEY
    const s = await generateSuggestion(base)
    expect(s?.provider).toBe('fregues')
  })

  it('sem produtos não sugere nada', async () => {
    expect(await generateSuggestion({ ...base, products: [] })).toBeNull()
  })

  it('se a IA falhar, cai no gerador próprio', async () => {
    process.env.GEMINI_API_KEY = 'teste'
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('erro', { status: 500 }))
    const s = await generateSuggestion(base)
    expect(s?.provider).toBe('fregues')
    fetchMock.mockRestore()
    delete process.env.GEMINI_API_KEY
  })
})
