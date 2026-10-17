import { describe, it, expect } from 'vitest'
import { checkOrderArithmetic, validateOrderForPixCharge } from './orderPricing'

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

describe('validateOrderForPixCharge', () => {
  const base = { priced_by_server: true, subtotal: 50, discount: 5, shipping_fee: 7, total: 52, items: [{}] }

  it('accepts a server-priced order whose numbers add up', () => {
    expect(validateOrderForPixCharge(base).valid).toBe(true)
  })

  it('accepts combos and birthday discounts (the old floor check rejected them)', () => {
    expect(validateOrderForPixCharge({ ...base, items: [{ combo_id: 'c1' }], discount: 5 }).valid).toBe(true)
  })

  it('rejects an order that was not priced by the server', () => {
    expect(validateOrderForPixCharge({ ...base, priced_by_server: false }).valid).toBe(false)
    expect(validateOrderForPixCharge({ ...base, priced_by_server: null }).valid).toBe(false)
  })

  it('rejects an order without items', () => {
    expect(validateOrderForPixCharge({ ...base, items: [] }).valid).toBe(false)
  })

  it('rejects an order whose total does not add up', () => {
    expect(validateOrderForPixCharge({ ...base, total: 1 }).valid).toBe(false)
  })
})
