import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { checkOrderArithmetic, validateOrderPricingFloor } from './orderPricing'

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

// Fake mínimo do admin client: só implementa a fatia de encadeamento que
// validateOrderPricingFloor realmente chama (from().select().in(),
// from().select().eq().maybeSingle(), rpc()).
function createFakeAdmin(opts: {
  productPrice: number
  rpcResult?: { data: unknown; error: unknown }
}): SupabaseClient {
  const rpcResult = opts.rpcResult ?? { data: null, error: null }
  return {
    from(table: string) {
      if (table === 'products') {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: [{ id: 'p1', price: opts.productPrice }], error: null }),
          }),
        }
      }
      if (table === 'establishments') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { birthday_discount_percent: 0 } }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table in test fake: ${table}`)
    },
    rpc: () => Promise.resolve(rpcResult),
  } as unknown as SupabaseClient
}

const baseOrder = {
  items: [{ product_id: 'p1', quantity: 1, name: 'Item', unit_price: 100, total_price: 100 }] as any,
  establishment_id: 'est-1',
  customer_phone: '11999998888',
}

describe('validateOrderPricingFloor — resgate de pontos de fidelidade', () => {
  it('accepts a percent_discount reward with matching discount', async () => {
    const admin = createFakeAdmin({
      productPrice: 100,
      rpcResult: { data: [{ valid: true, benefit_type: 'percent_discount', benefit_value: 20, points_cost: 50, message: 'ok' }], error: null },
    })
    const result = await validateOrderPricingFloor(admin, {
      ...baseOrder,
      subtotal: 100,
      discount: 20,
      shipping_fee: 0,
      total: 80,
      coupon_code: null,
      loyalty_reward_id: 'reward-1',
    })
    expect(result.valid).toBe(true)
  })

  it('accepts a fixed_discount reward capped at the subtotal', async () => {
    const admin = createFakeAdmin({
      productPrice: 100,
      rpcResult: { data: [{ valid: true, benefit_type: 'fixed_discount', benefit_value: 15, points_cost: 30, message: 'ok' }], error: null },
    })
    const result = await validateOrderPricingFloor(admin, {
      ...baseOrder,
      subtotal: 100,
      discount: 15,
      shipping_fee: 0,
      total: 85,
      coupon_code: null,
      loyalty_reward_id: 'reward-2',
    })
    expect(result.valid).toBe(true)
  })

  it('accepts a free_shipping reward that does not touch the subtotal discount', async () => {
    const admin = createFakeAdmin({
      productPrice: 100,
      rpcResult: { data: [{ valid: true, benefit_type: 'free_shipping', benefit_value: null, points_cost: 40, message: 'ok' }], error: null },
    })
    const result = await validateOrderPricingFloor(admin, {
      ...baseOrder,
      subtotal: 100,
      discount: 0,
      shipping_fee: 0,
      total: 100,
      coupon_code: null,
      loyalty_reward_id: 'reward-3',
    })
    expect(result.valid).toBe(true)
  })

  it('rejects when the server says the redemption is invalid (e.g. insufficient balance)', async () => {
    const admin = createFakeAdmin({
      productPrice: 100,
      rpcResult: { data: [{ valid: false, benefit_type: null, benefit_value: null, points_cost: null, message: 'Saldo insuficiente' }], error: null },
    })
    const result = await validateOrderPricingFloor(admin, {
      ...baseOrder,
      subtotal: 100,
      discount: 20,
      shipping_fee: 0,
      total: 80,
      coupon_code: null,
      loyalty_reward_id: 'reward-4',
    })
    expect(result.valid).toBe(false)
  })

  it('rejects a discount larger than the reward allows', async () => {
    const admin = createFakeAdmin({
      productPrice: 100,
      rpcResult: { data: [{ valid: true, benefit_type: 'percent_discount', benefit_value: 10, points_cost: 20, message: 'ok' }], error: null },
    })
    const result = await validateOrderPricingFloor(admin, {
      ...baseOrder,
      subtotal: 100,
      discount: 50, // pedido tenta descontar 50, mas a recompensa só dá 10%
      shipping_fee: 0,
      total: 50,
      coupon_code: null,
      loyalty_reward_id: 'reward-5',
    })
    expect(result.valid).toBe(false)
  })
})
