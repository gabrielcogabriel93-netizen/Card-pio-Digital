import { describe, it, expect } from 'vitest'
import { resolveSubscriptionAccess } from './subscription'

const NOW = new Date('2026-07-30T12:00:00Z')

describe('resolveSubscriptionAccess', () => {
  it('libera tudo quando a cobrança está desligada, mesmo com trial vencido', () => {
    const result = resolveSubscriptionAccess(
      { billingEnabled: false, status: 'trial', trialEndsAt: '2020-01-01T00:00:00Z', currentPeriodEnd: null },
      NOW
    )
    expect(result).toEqual({ blocked: false, reason: 'billing_disabled' })
  })

  it('isento nunca bloqueia, mesmo com cobrança ligada', () => {
    const result = resolveSubscriptionAccess(
      { billingEnabled: true, status: 'exempt', trialEndsAt: '2020-01-01T00:00:00Z', currentPeriodEnd: null },
      NOW
    )
    expect(result).toEqual({ blocked: false, reason: 'exempt' })
  })

  it('trial sem prazo definido não bloqueia', () => {
    const result = resolveSubscriptionAccess(
      { billingEnabled: true, status: 'trial', trialEndsAt: null, currentPeriodEnd: null },
      NOW
    )
    expect(result).toEqual({ blocked: false, reason: 'trial_active' })
  })

  it('trial dentro do prazo não bloqueia', () => {
    const result = resolveSubscriptionAccess(
      { billingEnabled: true, status: 'trial', trialEndsAt: '2026-08-05T00:00:00Z', currentPeriodEnd: null },
      NOW
    )
    expect(result).toEqual({ blocked: false, reason: 'trial_active' })
  })

  it('trial vencido bloqueia', () => {
    const result = resolveSubscriptionAccess(
      { billingEnabled: true, status: 'trial', trialEndsAt: '2026-07-01T00:00:00Z', currentPeriodEnd: null },
      NOW
    )
    expect(result).toEqual({ blocked: true, reason: 'trial_expired' })
  })

  it('assinatura ativa dentro do período pago não bloqueia', () => {
    const result = resolveSubscriptionAccess(
      { billingEnabled: true, status: 'active', trialEndsAt: null, currentPeriodEnd: '2026-08-15T00:00:00Z' },
      NOW
    )
    expect(result).toEqual({ blocked: false, reason: 'subscription_active' })
  })

  it('assinatura ativa com período vencido bloqueia', () => {
    const result = resolveSubscriptionAccess(
      { billingEnabled: true, status: 'active', trialEndsAt: null, currentPeriodEnd: '2026-06-01T00:00:00Z' },
      NOW
    )
    expect(result).toEqual({ blocked: true, reason: 'subscription_expired' })
  })

  it('assinatura ativa sem current_period_end (estado inconsistente) não bloqueia por segurança', () => {
    const result = resolveSubscriptionAccess(
      { billingEnabled: true, status: 'active', trialEndsAt: null, currentPeriodEnd: null },
      NOW
    )
    expect(result).toEqual({ blocked: false, reason: 'subscription_active' })
  })
})
