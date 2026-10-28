import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { CAMPAIGN_COOKIE, FALLBACK_OFFER, normalizeCampaignCode, parseOffer, type SignupOffer } from '@/lib/offer'

/**
 * Oferta para quem está visitando (servidor): a da campanha do cookie
 * (link /p/codigo) se ela estiver valendo, senão a configurada no admin.
 * Se o banco falhar, não promete teste grátis.
 */
export async function getVisitorOffer(): Promise<SignupOffer> {
  const code = normalizeCampaignCode(cookies().get(CAMPAIGN_COOKIE)?.value)
  try {
    const { data, error } = await createAdminClient().rpc('get_signup_offer', { p_campaign: code })
    if (error || !data) return FALLBACK_OFFER
    return parseOffer(data)
  } catch {
    return FALLBACK_OFFER
  }
}
