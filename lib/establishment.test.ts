import { describe, it, expect } from 'vitest'
import { slugify } from './establishment'

describe('slugify', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugify('Pizzaria do João')).toBe('pizzaria-do-joao')
  })

  it('removes accents', () => {
    expect(slugify('Açaí & Cia')).toBe('acai-cia')
  })

  it('strips leading/trailing hyphens', () => {
    expect(slugify('  -Loja Teste-  ')).toBe('loja-teste')
  })

  it('collapses repeated separators', () => {
    expect(slugify('Loja   com --- espaços')).toBe('loja-com-espacos')
  })

  it('returns empty string for input with no valid characters', () => {
    expect(slugify('!!!')).toBe('')
  })
})
