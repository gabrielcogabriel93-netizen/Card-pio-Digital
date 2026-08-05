import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createConnectedAccount, createAccountLink } from '@/lib/stripe'
import { generateUniqueAffiliateCode } from '@/lib/divulgador'
import { getBaseUrl } from '@/lib/baseUrl'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'

// Chamada logo depois de supabase.auth.signUp() (com sessão já ativa) OU
// mais tarde, em /divulgador/completar-cadastro, se o cadastro exigiu
// confirmação de e-mail antes de existir sessão -- por isso é
// idempotente: se a linha em `divulgadores` já existe pra esse usuário,
// reaproveita (só garante que a conta conectada Stripe existe e devolve
// um novo link de onboarding, que expira rápido).
//
// A criação da conta conectada Stripe (dado bancário/KYC) precisa da
// secret key, por isso não dá pra fazer isso direto do client como
// createEstablishmentWithUniqueSlug faz pra loja -- daí não existir
// policy de INSERT em `divulgadores` pro client (migration 034).
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user || !user.email) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const nome = String(body?.nome || '').trim()

    const admin = createAdminClient()

    let { data: divulgador, error: fetchError } = await admin
      .from('divulgadores')
      .select('id, stripe_account_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (fetchError) throw fetchError

    if (!divulgador) {
      if (!nome) {
        return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
      }

      const codigoAfiliado = await generateUniqueAffiliateCode(admin, nome)

      const { data: created, error: insertError } = await admin
        .from('divulgadores')
        .insert({ user_id: user.id, nome, email: user.email, codigo_afiliado: codigoAfiliado })
        .select('id, stripe_account_id')
        .single()
      if (insertError) throw insertError
      divulgador = created
    }

    let stripeAccountId = divulgador.stripe_account_id
    if (!stripeAccountId) {
      stripeAccountId = await createConnectedAccount({ id: divulgador.id, email: user.email, nome: nome || user.email })
      const { error: updateError } = await admin
        .from('divulgadores')
        .update({ stripe_account_id: stripeAccountId })
        .eq('id', divulgador.id)
      if (updateError) throw updateError
    }

    const baseUrl = getBaseUrl()
    const onboardingUrl = await createAccountLink({
      accountId: stripeAccountId,
      refreshUrl: `${baseUrl}/divulgador/completar-cadastro`,
      returnUrl: `${baseUrl}/divulgador/dashboard?onboarding=retorno`,
    })

    return NextResponse.json({ onboardingUrl })
  } catch (err: any) {
    logError('api:divulgador:cadastro', 'erro ao cadastrar divulgador', err)
    return NextResponse.json({ error: err.message || 'Erro ao cadastrar divulgador' }, { status: 500 })
  }
}
