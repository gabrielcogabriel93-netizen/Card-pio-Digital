import { describe, it, expect } from 'vitest'
import { normalizeInstagramInput } from './instagram'

describe('normalizeInstagramInput', () => {
  it('normalizes a handle with @', () => {
    expect(normalizeInstagramInput('@minhaloja')).toBe('https://instagram.com/minhaloja')
  })

  it('normalizes a bare handle', () => {
    expect(normalizeInstagramInput('minhaloja')).toBe('https://instagram.com/minhaloja')
  })

  it('normalizes a full URL', () => {
    expect(normalizeInstagramInput('https://www.instagram.com/minhaloja/')).toBe('https://instagram.com/minhaloja')
  })

  it('normalizes a URL without protocol', () => {
    expect(normalizeInstagramInput('instagram.com/minhaloja')).toBe('https://instagram.com/minhaloja')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeInstagramInput('  @minhaloja  ')).toBe('https://instagram.com/minhaloja')
  })

  it('returns null for empty input', () => {
    expect(normalizeInstagramInput('')).toBeNull()
    expect(normalizeInstagramInput('   ')).toBeNull()
  })

  it('returns null for just an @ with nothing after it', () => {
    expect(normalizeInstagramInput('@')).toBeNull()
  })
})
