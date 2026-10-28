import { describe, it, expect } from 'vitest'
import { parseOffer, ctaLabel, startLabel, offerBadge, offerFinePrint, discountText, normalizeCampaignCode, FALLBACK_OFFER } from './offer'

describe('oferta de entrada', () => {
  it('com teste grátis mostra os dias configurados', () => {
    const o = parseOffer({ trial_days: 14, discount_percent: 0, discount_months: 0 })
    expect(ctaLabel(o)).toBe('Testar 14 dias grátis')
    expect(startLabel(o)).toBe('Começar 14 dias grátis')
    expect(offerBadge(o)).toBe('14 dias grátis')
    expect(offerFinePrint(o)).toMatch(/^14 dias grátis com tudo liberado, sem cartão/)
  })

  it('sem teste não promete nada grátis', () => {
    const o = parseOffer({ trial_days: 0 })
    expect(ctaLabel(o)).toBe('Criar minha loja')
    expect(startLabel(o)).toBe('Começar agora')
    expect(offerBadge(o)).toBeNull()
    expect(offerFinePrint(o)).not.toMatch(/grátis|sem cartão/)
  })

  it('campanha com desconto (ex.: Black Friday)', () => {
    const o = parseOffer({ trial_days: 0, campaign_code: 'black-friday', campaign_name: 'Black Friday', discount_percent: 50, discount_months: 3 })
    expect(o.campaignName).toBe('Black Friday')
    expect(discountText(o)).toBe('50% de desconto nos 3 primeiros meses')
    expect(offerBadge(o)).toBe('50% de desconto nos 3 primeiros meses')
    expect(offerFinePrint(o)).toMatch(/^50% de desconto nos 3 primeiros meses\./)
    expect(discountText({ discountPercent: 20, discountMonths: 1 })).toBe('20% de desconto no primeiro mês')
    expect(discountText({ discountPercent: 20, discountMonths: 0 })).toBeNull()
  })

  it('1 dia no singular e dados ruins viram oferta sem teste', () => {
    expect(ctaLabel(parseOffer({ trial_days: 1 }))).toBe('Testar 1 dia grátis')
    expect(parseOffer(null)).toEqual(FALLBACK_OFFER)
    expect(parseOffer({ trial_days: 'x' }).trialDays).toBe(0)
  })

  it('código do link', () => {
    expect(normalizeCampaignCode(' Parceria-Joao ')).toBe('parceria-joao')
    expect(normalizeCampaignCode('a')).toBeNull()
    expect(normalizeCampaignCode('com espaço')).toBeNull()
    expect(normalizeCampaignCode('../admin')).toBeNull()
  })
})
