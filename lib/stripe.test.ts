import { describe, it, expect } from 'vitest'
import { calculateCommissionAmount } from './stripe'

describe('calculateCommissionAmount', () => {
  it('calculates a simple percentage', () => {
    expect(calculateCommissionAmount(49.9, 10)).toBeCloseTo(4.99, 2)
  })

  it('rounds to the nearest cent', () => {
    expect(calculateCommissionAmount(49.9, 12.5)).toBeCloseTo(6.24, 2) // 6.2375 -> 6.24
  })

  it('returns the full amount at 100%', () => {
    expect(calculateCommissionAmount(100, 100)).toBe(100)
  })

  it('returns 0 for a 0% (edge case, should never happen given the DB check constraint)', () => {
    expect(calculateCommissionAmount(100, 0)).toBe(0)
  })
})
