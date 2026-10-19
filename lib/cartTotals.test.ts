import { describe, it, expect } from 'vitest'
import { computeCartTotals } from './cartTotals'
import { toggleGroupOption } from './variations'
import { cartItemKey, buildOrderItemsPayload, orderItemsToPayload } from './orderPayload'

describe('computeCartTotals (mesmas regras do place_order)', () => {
  const base = { subtotal: 50, orderType: 'delivery' as const, deliveryFee: 5, freeShippingThreshold: 100, discount: null }

  it('adds delivery fee only for delivery', () => {
    expect(computeCartTotals(base).total).toBe(55)
    expect(computeCartTotals({ ...base, orderType: 'pickup' }).total).toBe(50)
  })

  it('gives free shipping above the threshold and says how much is missing', () => {
    expect(computeCartTotals(base).missingForFreeShipping).toBe(50)
    const t = computeCartTotals({ ...base, subtotal: 120 })
    expect(t.deliveryFee).toBe(0)
    expect(t.freeShipping).toBe(true)
    expect(t.total).toBe(120)
  })

  it('applies percent and fixed coupons, capped at the subtotal', () => {
    expect(computeCartTotals({ ...base, discount: { kind: 'coupon', discountType: 'percent', value: 10 } }).discount).toBe(5)
    expect(computeCartTotals({ ...base, discount: { kind: 'coupon', discountType: 'fixed', value: 80 } }).discount).toBe(50)
  })

  it('free-shipping coupon zeroes the fee without touching the subtotal', () => {
    const t = computeCartTotals({ ...base, discount: { kind: 'coupon', discountType: 'free_shipping', value: 0 } })
    expect(t.discount).toBe(0)
    expect(t.deliveryFee).toBe(0)
    expect(t.total).toBe(50)
  })

  it('applies loyalty and birthday discounts', () => {
    expect(computeCartTotals({ ...base, discount: { kind: 'loyalty', benefitType: 'fixed_discount', value: 5 } }).total).toBe(50)
    expect(computeCartTotals({ ...base, discount: { kind: 'birthday', percent: 10 } }).total).toBe(50)
  })

  it('taxa não definida fica pendente (nunca vira grátis sozinha)', () => {
    const t = computeCartTotals({ ...base, deliveryFee: null })
    expect(t.deliveryPending).toBe(true)
    expect(t.deliveryFee).toBe(0)
    expect(t.total).toBe(50)
    expect(computeCartTotals({ ...base, deliveryFee: null, subtotal: 120 }).deliveryPending).toBe(false)
    expect(computeCartTotals({ ...base, deliveryFee: null, discount: { kind: 'coupon', discountType: 'free_shipping', value: 0 } }).deliveryPending).toBe(false)
    expect(computeCartTotals({ ...base, deliveryFee: null, orderType: 'pickup' }).deliveryPending).toBe(false)
    expect(computeCartTotals({ ...base, deliveryFee: 0 }).deliveryPending).toBe(false)
  })

  it('rounds to cents', () => {
    expect(computeCartTotals({ ...base, subtotal: 33.33, discount: { kind: 'coupon', discountType: 'percent', value: 15 } }).discount).toBe(5)
  })
})

describe('toggleGroupOption', () => {
  it('single choice replaces and can be unselected', () => {
    expect(toggleGroupOption(['a'], 'b', { allow_multiple: false })).toEqual(['b'])
    expect(toggleGroupOption(['a'], 'a', { allow_multiple: false })).toEqual([])
  })

  it('multiple choice respects max_select', () => {
    expect(toggleGroupOption(['a', 'b'], 'c', { allow_multiple: true, max_select: 2 })).toEqual(['a', 'b'])
    expect(toggleGroupOption(['a', 'b'], 'b', { allow_multiple: true, max_select: 2 })).toEqual(['a'])
    expect(toggleGroupOption(['a'], 'c', { allow_multiple: true, max_select: null })).toEqual(['a', 'c'])
  })
})

describe('orderPayload', () => {
  const product = { id: 'p1' }

  it('builds the payload sent to place_order (ids only, no prices)', () => {
    const payload = buildOrderItemsPayload([
      { product, quantity: 2, note: ' sem cebola ', config: { kind: 'product', product_id: 'p1', option_ids: ['o1'] } },
    ])
    expect(payload).toEqual([{ kind: 'product', product_id: 'p1', option_ids: ['o1'], quantity: 2, note: 'sem cebola' }])
    expect(JSON.stringify(payload)).not.toMatch(/price/)
  })

  it('falls back to combo selections when there is no config', () => {
    const payload = buildOrderItemsPayload([
      { product: { id: 'c1' }, quantity: 1, combo: { combo_id: 'c1', selections: [{ group_id: 'g1', group_name: 'Bebida', product_id: 'p9', product_name: 'Refri' }] } },
    ])
    expect(payload[0]).toEqual({ kind: 'combo', combo_id: 'c1', selections: [{ group_id: 'g1', product_id: 'p9' }], quantity: 1 })
  })

  it('treats the same item with different notes as different cart lines', () => {
    const a = { product, note: '', variations: [], config: { kind: 'product' as const, product_id: 'p1', option_ids: ['x', 'y'] } }
    const b = { ...a, config: { kind: 'product' as const, product_id: 'p1', option_ids: ['y', 'x'] } }
    expect(cartItemKey(a)).toBe(cartItemKey(b))
    expect(cartItemKey(a)).not.toBe(cartItemKey({ ...a, note: 'sem gelo' }))
  })

  it('rebuilds a past order for "pedir de novo"', () => {
    const payload = orderItemsToPayload([
      { product_id: 'p1', product_name: 'X', quantity: 2, unit_price: 10, total_price: 20, config: { kind: 'product', product_id: 'p1', option_ids: ['o1'] }, note: 'sem sal' },
      { product_id: 'p2', product_name: 'Simples', quantity: 1, unit_price: 5, total_price: 5, variations: [] },
      { product_id: 'p3', product_name: 'Antigo com opção', quantity: 1, unit_price: 5, total_price: 5, variations: [{ group_name: 'G', option_name: 'O', price_delta: 1 }] },
    ])
    expect(payload).toHaveLength(2)
    expect(payload[0]).toEqual({ kind: 'product', product_id: 'p1', option_ids: ['o1'], quantity: 2, note: 'sem sal' })
    expect(payload[1]).toEqual({ kind: 'product', product_id: 'p2', option_ids: [], quantity: 1 })
  })
})
