import { describe, it, expect } from 'vitest'
import { sumTabTotal } from './tableTab'

describe('sumTabTotal', () => {
  it('returns 0 for an empty tab', () => {
    expect(sumTabTotal([])).toBe(0)
  })

  it('sums multiple orders', () => {
    expect(sumTabTotal([
      { total: 45.9, status: 'completed' },
      { total: 6, status: 'pending' },
      { total: 18.9, status: 'preparing' },
    ])).toBeCloseTo(70.8)
  })

  it('excludes cancelled orders from the total', () => {
    expect(sumTabTotal([
      { total: 45.9, status: 'completed' },
      { total: 100, status: 'cancelled' },
    ])).toBeCloseTo(45.9)
  })
})
