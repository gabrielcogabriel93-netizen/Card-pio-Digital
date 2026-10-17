import { describe, it, expect, afterEach } from 'vitest'
import { encryptSecret, decryptSecret, isEncrypted } from './secretBox'

const KEY = 'a'.repeat(64)

describe('secretBox', () => {
  afterEach(() => {
    delete process.env.SECRETS_ENCRYPTION_KEY
  })

  it('round-trips a secret with the configured key', () => {
    process.env.SECRETS_ENCRYPTION_KEY = KEY
    const enc = encryptSecret('APP_USR-123')
    expect(isEncrypted(enc)).toBe(true)
    expect(enc).not.toContain('APP_USR')
    expect(decryptSecret(enc)).toBe('APP_USR-123')
  })

  it('uses a random IV (same input, different output)', () => {
    process.env.SECRETS_ENCRYPTION_KEY = KEY
    expect(encryptSecret('x')).not.toBe(encryptSecret('x'))
  })

  it('reads legacy plain-text values unchanged', () => {
    expect(decryptSecret('APP_USR-legacy')).toBe('APP_USR-legacy')
  })

  it('keeps plain text when no key is configured', () => {
    expect(encryptSecret('APP_USR-1')).toBe('APP_USR-1')
  })

  it('fails to decrypt with a different key (tamper/wrong key)', () => {
    process.env.SECRETS_ENCRYPTION_KEY = KEY
    const enc = encryptSecret('segredo')
    process.env.SECRETS_ENCRYPTION_KEY = 'b'.repeat(64)
    expect(() => decryptSecret(enc)).toThrow()
  })

  it('rejects a key with the wrong size', () => {
    process.env.SECRETS_ENCRYPTION_KEY = 'abc'
    expect(() => encryptSecret('x')).toThrow(/32 bytes/)
  })
})
