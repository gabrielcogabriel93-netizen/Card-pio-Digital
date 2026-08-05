import { NextResponse } from 'next/server'
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// Só pra app/divulgador/dashboard/layout.tsx decidir pra onde
// redirecionar (sem sessão -> /divulgador/login; sessão mas sem perfil
// ainda -> /divulgador/completar-cadastro) -- mesmo espírito de
// app/api/admin/check/route.ts. Leitura direto do banco (sem chamar a
// Stripe), pra ser rápido em toda navegação; quem reconcilia o status
// de onboarding com a Stripe de verdade é /api/divulgador/me.
export async function GET() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ authenticated: false, hasProfile: false }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: divulgador } = await admin
    .from('divulgadores')
    .select('stripe_onboarding_completo')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({
    authenticated: true,
    hasProfile: !!divulgador,
    onboardingComplete: !!divulgador?.stripe_onboarding_completo,
  })
}
