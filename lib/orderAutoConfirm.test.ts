import { describe, it, expect } from 'vitest'
import { resolveAutoConfirmStatus } from './orderAutoConfirm'

describe('resolveAutoConfirmStatus', () => {
  it('goes to confirmed when the store has order tracking enabled', () => {
    expect(resolveAutoConfirmStatus(true)).toBe('confirmed')
  })

  it('skips straight to completed when the store has order tracking disabled', () => {
    expect(resolveAutoConfirmStatus(false)).toBe('completed')
  })
})
