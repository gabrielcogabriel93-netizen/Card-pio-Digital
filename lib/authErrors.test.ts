import { describe, it, expect } from 'vitest'
import { translateAuthError, safeRedirectPath } from './authErrors'

describe('translateAuthError', () => {
  it('translates known Supabase messages', () => {
    expect(translateAuthError('Invalid login credentials')).toBe('E-mail ou senha incorretos.')
    expect(translateAuthError('User already registered')).toMatch(/Já existe uma conta/)
    expect(translateAuthError('Email rate limit exceeded')).toMatch(/Muitas tentativas/)
  })

  it('falls back to a generic Portuguese message', () => {
    expect(translateAuthError('Something internal broke')).toBe('Algo deu errado. Tente novamente.')
    expect(translateAuthError(null)).toBe('Algo deu errado. Tente novamente.')
  })
})

describe('safeRedirectPath', () => {
  it('accepts internal paths', () => {
    expect(safeRedirectPath('/painel/pedidos')).toBe('/painel/pedidos')
  })

  it('rejects external or protocol-relative redirects', () => {
    expect(safeRedirectPath('https://evil.com')).toBe('/')
    expect(safeRedirectPath('//evil.com')).toBe('/')
    expect(safeRedirectPath('/\\evil.com')).toBe('/')
    expect(safeRedirectPath(null, '/painel')).toBe('/painel')
  })
})
