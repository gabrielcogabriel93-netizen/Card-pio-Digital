import { describe, it, expect } from 'vitest'
import { checkOrderArithmetic } from './orderPricing'

describe('checkOrderArithmetic', () => {
  it('accepts a total that matches subtotal - discount + shipping', () => {
    expect(checkOrderArithmetic(100, 10, 5, 95)).toEqual({ valid: true })
  })

  it('accepts small floating-point rounding differences', () => {
    expect(checkOrderArithmetic(19.9, 0, 5, 24.9).valid).toBe(true)
  })

  it('rejects a total manipulated to near zero', () => {
    const result = checkOrderArithmetic(100, 0, 0, 0.01)
    expect(result.valid).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it('rejects a total that ignores the discount', () => {
    expect(checkOrderArithmetic(100, 20, 0, 100).valid).toBe(false)
  })

  it('rejects a total that ignores shipping', () => {
    expect(checkOrderArithmetic(100, 0, 15, 100).valid).toBe(false)
  })
})
