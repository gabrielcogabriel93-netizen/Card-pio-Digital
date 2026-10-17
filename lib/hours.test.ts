import { describe, it, expect } from 'vitest'
import { isWithinOpeningHours, getWeeklyHours, getStoreAvailability, localDayAndMinutes } from './hours'

const hours = {
  seg: { open: '08:00', close: '22:00' },
  ter: { open: '08:00', close: '22:00' },
  sex: { open: '18:00', close: '02:00' }, // atravessa a meia-noite
}

// Datas em UTC + fuso 'UTC' nas chamadas: o teste dá o mesmo resultado
// em qualquer máquina (o CI roda em UTC, o Windows local em BRT).
function dateFor(dayOfWeek: number, hour: number, minute: number) {
  // 2024-01-01 é uma segunda-feira (dayOfWeek 1)
  return new Date(Date.UTC(2024, 0, 1 + ((dayOfWeek - 1 + 7) % 7), hour, minute))
}

describe('isWithinOpeningHours', () => {
  it('returns true when no hours are configured', () => {
    expect(isWithinOpeningHours(undefined)).toBe(true)
    expect(isWithinOpeningHours(null)).toBe(true)
  })

  it('returns true during opening hours', () => {
    expect(isWithinOpeningHours(hours, dateFor(1, 10, 0), 'UTC')).toBe(true)
  })

  it('returns false outside opening hours on a configured day', () => {
    expect(isWithinOpeningHours(hours, dateFor(1, 23, 0), 'UTC')).toBe(false)
  })

  it('returns true for a day with no configured hours (does not block)', () => {
    expect(isWithinOpeningHours(hours, dateFor(3, 10, 0), 'UTC')).toBe(true) // quarta não está no objeto
  })

  it('handles hours that cross midnight', () => {
    expect(isWithinOpeningHours(hours, dateFor(5, 23, 30), 'UTC')).toBe(true)
    expect(isWithinOpeningHours(hours, dateFor(5, 1, 0), 'UTC')).toBe(true)
    expect(isWithinOpeningHours(hours, dateFor(5, 10, 0), 'UTC')).toBe(false)
  })

  it('uses the store timezone, not the device clock', () => {
    // Segunda 23:30 UTC = segunda 20:30 em São Paulo (UTC-3): aberta lá.
    expect(isWithinOpeningHours(hours, dateFor(1, 23, 30), 'UTC')).toBe(false)
    expect(isWithinOpeningHours(hours, dateFor(1, 23, 30), 'America/Sao_Paulo')).toBe(true)
  })
})

describe('localDayAndMinutes', () => {
  it('converts to the given timezone', () => {
    // Terça 01:00 UTC ainda é segunda 22:00 em São Paulo.
    expect(localDayAndMinutes(dateFor(2, 1, 0), 'America/Sao_Paulo')).toEqual({ dayIndex: 1, minutes: 22 * 60 })
  })
})

describe('getStoreAvailability', () => {
  it('says until when the store is open', () => {
    expect(getStoreAvailability({ isOpen: true, openingHours: hours, timeZone: 'UTC' }, dateFor(1, 10, 0))).toEqual({ open: true, label: 'Aberto até 22:00' })
  })

  it('says when it opens next', () => {
    expect(getStoreAvailability({ isOpen: true, openingHours: hours, timeZone: 'UTC' }, dateFor(1, 6, 0)).label).toBe('Abre hoje às 08:00')
    expect(getStoreAvailability({ isOpen: true, openingHours: hours, timeZone: 'UTC' }, dateFor(1, 23, 0)).label).toBe('Abre amanhã às 08:00')
    expect(getStoreAvailability({ isOpen: true, openingHours: hours, timeZone: 'UTC' }, dateFor(2, 23, 0)).label).toBe('Abre sexta às 18:00')
  })

  it('treats a paused store as closed', () => {
    const now = dateFor(1, 10, 0)
    const pausedUntil = new Date(now.getTime() + 30 * 60000).toISOString()
    const result = getStoreAvailability({ isOpen: true, pausedUntil, openingHours: hours, timeZone: 'UTC' }, now)
    expect(result.open).toBe(false)
    expect(result.label).toBe('Pausada, volta às 10:30')
  })

  it('ignores an expired pause', () => {
    const now = dateFor(1, 10, 0)
    const pausedUntil = new Date(now.getTime() - 60000).toISOString()
    expect(getStoreAvailability({ isOpen: true, pausedUntil, openingHours: hours, timeZone: 'UTC' }, now).open).toBe(true)
  })
})

describe('getWeeklyHours', () => {
  it('returns all 7 days, marking configured and unconfigured ones', () => {
    const rows = getWeeklyHours(hours, dateFor(1, 10, 0), 'UTC') // segunda
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
    const rows = getWeeklyHours(hours, dateFor(5, 12, 0), 'UTC') // sexta
    expect(rows.filter((r) => r.isToday)).toHaveLength(1)
    expect(rows.find((r) => r.isToday)?.key).toBe('sex')
  })
})
