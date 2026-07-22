import { describe, it, expect } from 'vitest'
import { formatPhoneNumber, toWhatsAppNumber } from './phone'

describe('formatPhoneNumber', () => {
  it('formats a full mobile number', () => {
    expect(formatPhoneNumber('11999998888')).toBe('(11) 99999-8888')
  })

  it('formats a partial number while typing', () => {
    expect(formatPhoneNumber('119')).toBe('(11) 9')
    expect(formatPhoneNumber('11')).toBe('(11')
  })

  it('ignores non-digit characters', () => {
    expect(formatPhoneNumber('(11) 99999-8888')).toBe('(11) 99999-8888')
  })

  it('caps at 11 digits', () => {
    expect(formatPhoneNumber('119999988887777')).toBe('(11) 99999-8888')
  })

  it('returns empty string for empty input', () => {
    expect(formatPhoneNumber('')).toBe('')
  })
})

describe('toWhatsAppNumber', () => {
  it('adds the country code to a local 11-digit number', () => {
    expect(toWhatsAppNumber('(11) 99999-8888')).toBe('5511999998888')
  })

  it('adds the country code to a local 10-digit number', () => {
    expect(toWhatsAppNumber('(11) 9999-8888')).toBe('551199998888')
  })

  it('keeps a number that already has the country code', () => {
    expect(toWhatsAppNumber('5511999998888')).toBe('5511999998888')
  })

  it('does not double the country code', () => {
    expect(toWhatsAppNumber('55 11 99999-8888')).toBe('5511999998888')
  })
})
