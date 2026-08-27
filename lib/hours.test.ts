import { describe, it, expect } from 'vitest'
import { isWithinOpeningHours, getWeeklyHours } from './hours'

const hours = {
  seg: { open: '08:00', close: '22:00' },
  ter: { open: '08:00', close: '22:00' },
  sex: { open: '18:00', close: '02:00' }, // atravessa a meia-noite
}

function dateFor(dayOfWeek: number, hour: number, minute: number) {
  // 2024-01-01 é uma segunda-feira (dayOfWeek 1)
  const base = new Date(2024, 0, 1 + ((dayOfWeek - 1 + 7) % 7))
  base.setHours(hour, minute, 0, 0)
  return base
}

describe('isWithinOpeningHours', () => {
  it('returns true when no hours are configured', () => {
    expect(isWithinOpeningHours(undefined)).toBe(true)
    expect(isWithinOpeningHours(null)).toBe(true)
  })

  it('returns true during opening hours', () => {
    expect(isWithinOpeningHours(hours, dateFor(1, 10, 0))).toBe(true)
  })

  it('returns false outside opening hours on a configured day', () => {
    expect(isWithinOpeningHours(hours, dateFor(1, 23, 0))).toBe(false)
  })

  it('returns true for a day with no configured hours (does not block)', () => {
    expect(isWithinOpeningHours(hours, dateFor(3, 10, 0))).toBe(true) // quarta não está no objeto
  })

  it('handles hours that cross midnight', () => {
    expect(isWithinOpeningHours(hours, dateFor(5, 23, 30))).toBe(true) // sexta 23:30
    expect(isWithinOpeningHours(hours, dateFor(5, 1, 0))).toBe(true) // sexta 01:00 (ainda dentro do turno de sexta)
    expect(isWithinOpeningHours(hours, dateFor(5, 10, 0))).toBe(false) // sexta 10:00, fora do turno
  })
})

describe('getWeeklyHours', () => {
  it('returns all 7 days, marking configured and unconfigured ones', () => {
    const rows = getWeeklyHours(hours, dateFor(1, 10, 0)) // segunda
    expect(rows).toHaveLength(7)

    const monday = rows.find((r) => r.key === 'seg')
    expect(monday?.hours).toEqual({ open: '08:00', close: '22:00' })
    expect(monday?.isToday).toBe(true)
    expect(monday?.label).toBe('Segunda-feira')

    const wednesday = rows.find((r) => r.key === 'qua')
    expect(wednesday?.hours).toBeNull()
    expect(wednesday?.isToday).toBe(false)
  })

  it('marks only the current day as isToday', () => {
    const rows = getWeeklyHours(hours, dateFor(5, 12, 0)) // sexta
    expect(rows.filter((r) => r.isToday)).toHaveLength(1)
    expect(rows.find((r) => r.isToday)?.key).toBe('sex')
  })

  it('returns all days with null hours when nothing is configured', () => {
    const rows = getWeeklyHours(undefined, dateFor(1, 10, 0))
    expect(rows.every((r) => r.hours === null)).toBe(true)
  })
})
