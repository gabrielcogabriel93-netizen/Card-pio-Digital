import { NextResponse } from 'next/server'
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createBillingPortalSession } from '@/lib/stripe'
import { getBaseUrl } from '@/lib/baseUrl'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'

// Abre o portal do cliente da Stripe para o lojista logado: trocar
// cartão, baixar faturas e cancelar a assinatura sozinho.
export async function POST() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const admin = createAdminClient()
    const { data: establishment } = await admin
      .from('establishments')
      .select('stripe_customer_id')
      .eq('owner_id', user.id)
      .maybeSingle()

    if (!establishment?.stripe_customer_id) {
      return NextResponse.json({ error: 'Você ainda não tem uma assinatura paga.' }, { status: 404 })
    }

    const url = await createBillingPortalSession(establishment.stripe_customer_id, `${getBaseUrl()}/painel/planos`)
    return NextResponse.json({ url })
  } catch (err: any) {
    logError('api:subscription:portal', 'erro ao abrir portal da assinatura', err)
    return NextResponse.json({ error: 'Não foi possível abrir o portal da assinatura agora.' }, { status: 500 })
  }
}
