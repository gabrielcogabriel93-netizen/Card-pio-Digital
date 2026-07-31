import { describe, it, expect } from 'vitest'
import { resolveAutoConfirmStatus, resolveNextAutomaticStatus, type AutomationTimings, type OrderForAutomation } from './orderAutoConfirm'

describe('resolveAutoConfirmStatus', () => {
  it('goes to confirmed when the store has order tracking enabled', () => {
    expect(resolveAutoConfirmStatus(true)).toBe('confirmed')
  })

  it('skips straight to completed when the store has order tracking disabled', () => {
    expect(resolveAutoConfirmStatus(false)).toBe('completed')
  })
})

describe('resolveNextAutomaticStatus', () => {
  const timings: AutomationTimings = {
    autoConfirmMinutes: 2,
    autoPreparingMinutes: 5,
    autoCompletedMinutesPickup: 15,
    autoCompletedMinutesDelivery: 30,
  }
  const now = new Date('2026-01-01T12:00:00Z')
  const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60000)

  const baseOrder: OrderForAutomation = {
    status: 'pending',
    orderType: 'pickup',
    paymentMethod: 'dinheiro',
    paymentStatus: null,
    statusChangedAt: minutesAgo(10),
    orderTrackingEnabled: true,
  }

  it('does not advance before the configured time has elapsed', () => {
    const order: OrderForAutomation = { ...baseOrder, statusChangedAt: minutesAgo(1) }
    expect(resolveNextAutomaticStatus(order, timings, now)).toBeNull()
  })

  it('confirms a pending order once its time is up, when tracking is enabled', () => {
    expect(resolveNextAutomaticStatus(baseOrder, timings, now)).toBe('confirmed')
  })

  it('skips straight to completed from pending when tracking is disabled', () => {
    const order: OrderForAutomation = { ...baseOrder, orderTrackingEnabled: false }
    expect(resolveNextAutomaticStatus(order, timings, now)).toBe('completed')
  })

  it('never advances an unpaid automatic Pix order out of pending', () => {
    const order: OrderForAutomation = {
      ...baseOrder,
      paymentMethod: 'mercadopago_pix',
      paymentStatus: 'pending',
      statusChangedAt: minutesAgo(999),
    }
    expect(resolveNextAutomaticStatus(order, timings, now)).toBeNull()
  })

  it('advances an approved automatic Pix order normally', () => {
    const order: OrderForAutomation = { ...baseOrder, paymentMethod: 'mercadopago_pix', paymentStatus: 'approved' }
    expect(resolveNextAutomaticStatus(order, timings, now)).toBe('confirmed')
  })

  it('moves confirmed orders to preparing once their time is up', () => {
    const order: OrderForAutomation = { ...baseOrder, status: 'confirmed', statusChangedAt: minutesAgo(6) }
    expect(resolveNextAutomaticStatus(order, timings, now)).toBe('preparing')
  })

  it('uses the pickup duration for preparing -> completed on pickup orders', () => {
    const order: OrderForAutomation = { ...baseOrder, status: 'preparing', orderType: 'pickup', statusChangedAt: minutesAgo(16) }
    expect(resolveNextAutomaticStatus(order, timings, now)).toBe('completed')
  })

  it('uses the longer delivery duration for preparing -> completed on delivery orders', () => {
    const order: OrderForAutomation = { ...baseOrder, status: 'preparing', orderType: 'delivery', statusChangedAt: minutesAgo(16) }
    expect(resolveNextAutomaticStatus(order, timings, now)).toBeNull() // ainda não passou dos 30min de entrega
  })

  it('completes a delivery order once the longer delivery duration has passed', () => {
    const order: OrderForAutomation = { ...baseOrder, status: 'preparing', orderType: 'delivery', statusChangedAt: minutesAgo(31) }
    expect(resolveNextAutomaticStatus(order, timings, now)).toBe('completed')
  })
})
