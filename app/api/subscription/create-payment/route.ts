import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createSubscriptionCheckoutSession, getStripeClient } from '@/lib/stripe'
import { getBaseUrl } from '@/lib/baseUrl'
import { logError } from '@/lib/logger'
import { COMPLETO_MONTHLY_PRICE, type PlanTier } from '@/lib/plans'

export const runtime = 'nodejs'

// Chamada pelo lojista logado (nunca pública, diferente de
// /api/mercadopago/create-payment) pra assinar a mensalidade da
// plataforma. A sessão identifica o dono, então nem precisa de
// establishmentId no corpo -- sempre a loja de quem está logado.
//
// Antes cobrava via Pix/Mercado Pago (migration 032); agora cria um
// Stripe Checkout Session de assinatura e devolve a URL pra
// redirecionar o lojista -- é ali que a Stripe já aplica o split
// automático pro divulgador, se houver indicação vinculada com
// onboarding completo (ver lib/stripe.ts). Pagamento que cada
// estabelecimento recebe dos PRÓPRIOS clientes continua em
// /api/mercadopago/create-payment, sem relação nenhuma com esta rota.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const tier: PlanTier = body?.tier === 'completo' ? 'completo' : 'essencial'

    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const admin = createAdminClient()

    const { data: establishment, error: estError } = await admin
      .from('establishments')
      .select('id, name, stripe_customer_id, stripe_subscription_id, plan_tier')
      .eq('owner_id', user.id)
      .maybeSingle()

    if (estError || !establishment) {
      return NextResponse.json({ error: 'Estabelecimento não encontrado' }, { status: 404 })
    }

    const { data: settings, error: settingsError } = await admin
      .from('platform_settings')
      .select('billing_enabled, monthly_price')
      .eq('id', true)
      .single()
    if (settingsError) throw settingsError

    if (!settings.billing_enabled) {
      return NextResponse.json({ error: 'A cobrança da plataforma não está ativa no momento.' }, { status: 400 })
    }

    // Indicação vinculada (se houver) -- só entra o split se o
    // divulgador já concluiu o onboarding Stripe, senão a assinatura é
    // criada normal, 100% pra plataforma.
    const { data: indicacao } = await admin
      .from('indicacoes')
      .select('divulgador_id, divulgadores!inner(stripe_account_id, stripe_onboarding_completo, percentual_comissao)')
      .eq('estabelecimento_id', establishment.id)
      .maybeSingle()

    const divulgador = (indicacao as any)?.divulgadores
    const divulgadorConnect =
      divulgador?.stripe_onboarding_completo && divulgador?.stripe_account_id
        ? {
            stripeAccountId: divulgador.stripe_account_id as string,
            percentualComissao: Number(divulgador.percentual_comissao),
          }
        : null

    const amount = tier === 'completo' ? COMPLETO_MONTHLY_PRICE : Number(settings.monthly_price)

    // Já existe assinatura ativa: troca o plano NA MESMA assinatura (com
    // proporcional) em vez de abrir um checkout novo, que criaria uma
    // segunda cobrança mensal. O webhook grava o novo plan_tier quando a
    // fatura proporcional for paga.
    if (establishment.stripe_subscription_id) {
      const stripe = getStripeClient()
      const current = await stripe.subscriptions.retrieve(establishment.stripe_subscription_id).catch(() => null)
      if (current && ['active', 'trialing', 'past_due'].includes(current.status)) {
        if (current.metadata?.tier === tier) {
          return NextResponse.json({ error: 'Você já está neste plano.' }, { status: 400 })
        }
        const item = current.items.data[0]
        await stripe.subscriptions.update(current.id, {
          items: [{
            id: item.id,
            price_data: {
              currency: 'brl',
              product: typeof item.price.product === 'string' ? item.price.product : item.price.product.id,
              unit_amount: Math.round(amount * 100),
              recurring: { interval: 'month' },
            },
          }],
          proration_behavior: 'always_invoice',
          metadata: { ...current.metadata, tier },
        })
        return NextResponse.json({ changed: true, url: `${getBaseUrl()}/painel/planos?assinatura=alterada` })
      }
    }

    const baseUrl = getBaseUrl()
    const { url } = await createSubscriptionCheckoutSession({
      establishmentId: establishment.id,
      establishmentName: establishment.name,
      ownerEmail: user.email || '',
      amount,
      tier,
      successUrl: `${baseUrl}/painel/planos?assinatura=sucesso`,
      cancelUrl: `${baseUrl}/painel/planos?assinatura=cancelada`,
      stripeCustomerId: establishment.stripe_customer_id,
      divulgadorConnect,
    })

    return NextResponse.json({ url })
  } catch (err: any) {
    logError('api:subscription:create-payment', 'erro ao criar cobrança de assinatura', err)
    return NextResponse.json({ error: err.message || 'Erro ao criar cobrança de assinatura' }, { status: 500 })
  }
}
