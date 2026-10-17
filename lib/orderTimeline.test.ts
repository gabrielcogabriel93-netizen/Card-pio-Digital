import { describe, it, expect } from 'vitest'
import { buildOrderTimeline, estimateArrival } from './orderTimeline'

const base = {
  status: 'pending' as const,
  order_type: 'delivery' as const,
  order_tracking_enabled: true,
  created_at: '2026-10-16T22:00:00Z',
}

describe('buildOrderTimeline', () => {
  it('shows the received step as current for a new order', () => {
    const steps = buildOrderTimeline(base)
    expect(steps.map((s) => s.key)).toEqual(['received', 'accepted', 'preparing', 'dispatched', 'completed'])
    expect(steps[0].state).toBe('current')
    expect(steps[1].state).toBe('todo')
  })

  it('marks "saiu para entrega" with its time and keeps earlier steps done', () => {
    const steps = buildOrderTimeline({ ...base, status: 'preparing', accepted_at: '2026-10-16T22:01:00Z', dispatched_at: '2026-10-16T22:20:00Z', eta_minutes: 35 })
    expect(steps.find((s) => s.key === 'dispatched')).toMatchObject({ state: 'current', at: '2026-10-16T22:20:00Z', label: 'Saiu para entrega' })
    expect(steps.find((s) => s.key === 'accepted')?.label).toContain('35 min')
    expect(steps.find((s) => s.key === 'preparing')?.state).toBe('done')
  })

  it('uses pickup wording and a short flow when tracking is off', () => {
    const steps = buildOrderTimeline({ ...base, order_type: 'pickup', order_tracking_enabled: false, status: 'completed', completed_at: '2026-10-16T22:30:00Z' })
    expect(steps.map((s) => s.label)).toEqual(['Pedido recebido', 'Aceito pela loja', 'Retirado'])
    expect(steps.every((s) => s.state === 'done')).toBe(true)
  })
})

describe('estimateArrival', () => {
  it('returns a ±5 min window in the store timezone', () => {
    expect(estimateArrival({ status: 'confirmed', accepted_at: '2026-10-16T22:00:00Z', eta_minutes: 30 })).toBe('19:25 – 19:35')
  })

  it('returns null without an ETA or after completion', () => {
    expect(estimateArrival({ status: 'confirmed', accepted_at: '2026-10-16T22:00:00Z', eta_minutes: null })).toBeNull()
    expect(estimateArrival({ status: 'completed', accepted_at: '2026-10-16T22:00:00Z', eta_minutes: 30 })).toBeNull()
  })
})
