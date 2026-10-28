// Oferta de entrada do Freguês (migration 059): teste grátis configurado
// no admin ou a oferta de uma campanha com link (/p/codigo). Os textos do
// site, cadastro, login e planos saem daqui, para nunca prometer "30 dias
// grátis" quando o dono desligou o teste ou a campanha cobra desde o início.

export const CAMPAIGN_COOKIE = 'fregues_campanha'

export interface SignupOffer {
  trialDays: number
  campaignCode: string | null
  campaignName: string | null
  discountPercent: number
  discountMonths: number
  campaignEndsAt: string | null
}

/** Usado se o banco não responder: o mais conservador (sem prometer teste). */
export const FALLBACK_OFFER: SignupOffer = { trialDays: 0, campaignCode: null, campaignName: null, discountPercent: 0, discountMonths: 0, campaignEndsAt: null }

export function parseOffer(raw: unknown): SignupOffer {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const int = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0)
  return {
    trialDays: int(r.trial_days),
    campaignCode: typeof r.campaign_code === 'string' ? r.campaign_code : null,
    campaignName: typeof r.campaign_name === 'string' ? r.campaign_name : null,
    discountPercent: int(r.discount_percent),
    discountMonths: int(r.discount_months),
    campaignEndsAt: typeof r.campaign_ends_at === 'string' ? r.campaign_ends_at : null,
  }
}

export const hasTrial = (o: SignupOffer) => o.trialDays > 0
export const hasDiscount = (o: Pick<SignupOffer, 'discountPercent' | 'discountMonths'>) => o.discountPercent > 0 && o.discountMonths > 0
export const daysText = (n: number) => (n === 1 ? '1 dia' : `${n} dias`)

/** "50% de desconto nos 3 primeiros meses" */
export function discountText(o: Pick<SignupOffer, 'discountPercent' | 'discountMonths'>): string | null {
  if (!hasDiscount(o)) return null
  return `${o.discountPercent}% de desconto ${o.discountMonths === 1 ? 'no primeiro mês' : `nos ${o.discountMonths} primeiros meses`}`
}

/** Botão principal: "Testar 30 dias grátis" ou "Criar minha loja". */
export function ctaLabel(o: SignupOffer): string {
  return hasTrial(o) ? `Testar ${daysText(o.trialDays)} grátis` : 'Criar minha loja'
}

/** Variação "Começar ..." usada no site. */
export function startLabel(o: SignupOffer): string {
  return hasTrial(o) ? `Começar ${daysText(o.trialDays)} grátis` : 'Começar agora'
}

/** Selo curto: "30 dias grátis", "50% de desconto nos 3 primeiros meses" ou null. */
export function offerBadge(o: SignupOffer): string | null {
  if (hasTrial(o)) return `${daysText(o.trialDays)} grátis`
  return discountText(o)
}

/** Frase de rodapé dos botões. */
export function offerFinePrint(o: SignupOffer): string {
  const d = discountText(o)
  if (hasTrial(o)) return `${daysText(o.trialDays)} grátis com tudo liberado, sem cartão de crédito${d ? `. Depois, ${d}` : ''}. Cancele quando quiser.`
  return `${d ? `${d.charAt(0).toUpperCase()}${d.slice(1)}. ` : ''}Sem comissão sobre as suas vendas. Cancele quando quiser, sem multa.`
}

/** Código de campanha válido para o link /p/codigo. */
export function normalizeCampaignCode(value: string | null | undefined): string | null {
  const v = (value || '').trim().toLowerCase()
  return /^[a-z0-9][a-z0-9-]{1,39}$/.test(v) ? v : null
}

/** Lê o cookie da campanha no navegador. */
export function readCampaignCookie(): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(new RegExp(`(?:^|; )${CAMPAIGN_COOKIE}=([^;]*)`))
  return normalizeCampaignCode(m ? decodeURIComponent(m[1]) : null)
}
