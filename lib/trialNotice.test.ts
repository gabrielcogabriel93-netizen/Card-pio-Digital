import { describe, it, expect } from 'vitest'
import { trialNotice, trialNoticeText } from './trialNotice'

const NOW = new Date('2026-11-21T15:00:00Z')
const row = (o = {}) => ({ status: 'trial', trial_ends_at: '2026-11-30T03:00:00Z', billing_enabled: true, blocked: false, ...o })

describe('aviso de fim do teste', () => {
  it('aparece nos últimos 7 dias, com a data', () => {
    expect(trialNotice(row(), NOW)).toBeNull() // faltam 9 dias
    const n = trialNotice(row(), new Date('2026-11-24T15:00:00Z'))!
    expect(n.daysLeft).toBe(6)
    expect(trialNoticeText(n)).toBe('Seu teste grátis termina em 6 dias (30/11). Assine para a loja continuar recebendo pedidos sem interrupção.')
    expect(trialNoticeText(trialNotice(row(), new Date('2026-11-29T15:00:00Z'))!)).toMatch(/termina amanhã/)
  })
  it('não aparece para quem assinou, é isento, já venceu ou sem cobrança', () => {
    const late = new Date('2026-11-25T15:00:00Z')
    expect(trialNotice(row({ status: 'active' }), late)).toBeNull()
    expect(trialNotice(row({ status: 'exempt' }), late)).toBeNull()
    expect(trialNotice(row({ billing_enabled: false }), late)).toBeNull()
    expect(trialNotice(row({ blocked: true }), late)).toBeNull()
    expect(trialNotice(row(), new Date('2026-12-01T00:00:00Z'))).toBeNull()
  })
})
