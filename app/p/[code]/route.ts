import { NextRequest, NextResponse } from 'next/server'
import { CAMPAIGN_COOKIE, normalizeCampaignCode } from '@/lib/offer'

// Link de campanha (parceiros, Black Friday...): /p/codigo guarda a
// campanha no navegador por 60 dias e leva para o site com a origem
// marcada. A oferta (prazo grátis, desconto) vem da campanha enquanto ela
// estiver ativa e dentro do período (migration 059).
export function GET(request: NextRequest, { params }: { params: { code: string } }) {
  const code = normalizeCampaignCode(params.code)
  const target = new URL('/', request.url)
  if (code) {
    target.searchParams.set('utm_source', 'campanha')
    target.searchParams.set('utm_campaign', code)
  }
  const res = NextResponse.redirect(target)
  if (code) {
    res.cookies.set(CAMPAIGN_COOKIE, code, { path: '/', maxAge: 60 * 86_400, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' })
  }
  return res
}
