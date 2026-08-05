import { NextResponse } from 'next/server'
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createConnectedAccount, createAccountLink } from '@/lib/stripe'
import { getBaseUrl } from '@/lib/baseUrl'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'

// Regera o Account Link de onboarding (ele expira rápido) pro divulgador
// que já tem perfil mas ainda não terminou o cadastro bancário na
// Stripe -- botão "Completar cadastro bancário" no dashboard.
export async function POST() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const admin = createAdminClient()

  try {
    const { data: divulgador, error: fetchError } = await admin
      .from('divulgadores')
      .select('id, nome, stripe_account_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (fetchError) throw fetchError
    if (!divulgador) {
      return NextResponse.json({ error: 'Perfil de divulgador não encontrado' }, { status: 404 })
    }

    let stripeAccountId = divulgador.stripe_account_id
    if (!stripeAccountId) {
      stripeAccountId = await createConnectedAccount({ id: divulgador.id, email: user.email!, nome: divulgador.nome })
      const { error: updateError } = await admin
        .from('divulgadores')
        .update({ stripe_account_id: stripeAccountId })
        .eq('id', divulgador.id)
      if (updateError) throw updateError
    }

    const baseUrl = getBaseUrl()
    const onboardingUrl = await createAccountLink({
      accountId: stripeAccountId,
      refreshUrl: `${baseUrl}/divulgador/dashboard`,
      returnUrl: `${baseUrl}/divulgador/dashboard?onboarding=retorno`,
    })

    return NextResponse.json({ onboardingUrl })
  } catch (err: any) {
    logError('api:divulgador:stripe-onboarding-link', 'erro ao gerar link de onboarding', err)
    return NextResponse.json({ error: err.message || 'Erro ao gerar link de onboarding' }, { status: 500 })
  }
}
