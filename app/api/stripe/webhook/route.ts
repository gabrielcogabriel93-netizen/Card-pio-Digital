import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { constructWebhookEvent, calculateCommissionAmount } from '@/lib/stripe'
import { log, logError } from '@/lib/logger'

export const runtime = 'nodejs'

// A Stripe chama essa rota toda vez que algo muda numa assinatura da
// MENSALIDADE DA PLATAFORMA (o que o estabelecimento paga pro
// CatalogAI) -- não tem nenhuma relação com o pagamento que cada
// estabelecimento recebe dos próprios clientes (isso é
// app/api/mercadopago/webhook, continua 100% Mercado Pago).
//
// Corpo precisa chegar CRU (request.text(), não request.json()) pra
// validar a assinatura -- stripe.webhooks.constructEvent recalcula o
// HMAC em cima dos bytes exatos que a Stripe mandou.
export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get('stripe-signature')

  let event: Stripe.Event
  try {
    event = constructWebhookEvent(rawBody, signature)
  } catch (err) {
    logError('api:stripe:webhook', 'assinatura inválida', err)
    return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 })
  }

  const admin = createAdminClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(admin, event.data.object as Stripe.Checkout.Session)
        break
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(admin, event.data.object as Stripe.Invoice)
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(admin, event.data.object as Stripe.Subscription)
        break
      default:
        // Outros eventos (ex: payment_failed) não precisam de ação --
        // get_my_subscription_status() já bloqueia sozinho quando
        // current_period_end passa, sem precisar de um estado "falhou".
        break
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    logError('api:stripe:webhook', `erro ao processar evento ${event.type}`, err)
    // 500 de propósito -- a Stripe reenvia eventos que falharam, o
    // comportamento certo pra uma falha transitória nossa.
    return NextResponse.json({ error: 'Erro ao processar webhook' }, { status: 500 })
  }
}

// Só grava os IDs -- quem muda subscription_status/current_period_end é
// sempre invoice.payment_succeeded (fonte única, evita duas rotas
// divergentes decidindo "está pago" ao mesmo tempo).
async function handleCheckoutSessionCompleted(admin: SupabaseClient, session: Stripe.Checkout.Session) {
  const establishmentId = session.metadata?.establishmentId
  if (!establishmentId || session.mode !== 'subscription' || !session.subscription) return

  const { error } = await admin
    .from('establishments')
    .update({
      stripe_customer_id: typeof session.customer === 'string' ? session.customer : session.customer?.id,
      stripe_subscription_id:
        typeof session.subscription === 'string' ? session.subscription : session.subscription.id,
    })
    .eq('id', establishmentId)
  if (error) throw error

  log('api:stripe:webhook', 'checkout de assinatura concluído', { establishmentId })
}

async function handleInvoicePaymentSucceeded(admin: SupabaseClient, invoice: Stripe.Invoice) {
  // A partir da API 2025 a Stripe moveu o vínculo com a assinatura pra
  // dentro de `parent.subscription_details` (invoice.subscription direto
  // não existe mais nas versões novas do SDK).
  const subscriptionDetails = invoice.parent?.subscription_details
  const subscriptionId =
    typeof subscriptionDetails?.subscription === 'string'
      ? subscriptionDetails.subscription
      : subscriptionDetails?.subscription?.id
  if (!subscriptionId) return // fatura avulsa, não é de assinatura -- nada a fazer aqui

  let { data: establishment } = await admin
    .from('establishments')
    .select('id')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle()

  // Fallback raro: invoice.payment_succeeded chegou antes de
  // checkout.session.completed terminar de gravar (webhooks não têm
  // ordem garantida). Recupera o establishmentId direto dos metadados da
  // subscription na Stripe e já aproveita pra gravar o vínculo.
  if (!establishment) {
    const { getStripeClient } = await import('@/lib/stripe')
    const stripe = getStripeClient()
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    const establishmentId = subscription.metadata?.establishmentId
    if (!establishmentId) {
      log('api:stripe:webhook', 'fatura paga sem establishment correspondente', { subscriptionId })
      return
    }
    const { data: updated, error: linkError } = await admin
      .from('establishments')
      .update({ stripe_customer_id: subscription.customer as string, stripe_subscription_id: subscriptionId })
      .eq('id', establishmentId)
      .select('id')
      .maybeSingle()
    if (linkError) throw linkError
    establishment = updated
  }

  if (!establishment) return

  const periodEnd = invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null

  const { error: updateError } = await admin
    .from('establishments')
    .update({ subscription_status: 'active', ...(periodEnd ? { current_period_end: periodEnd } : {}) })
    .eq('id', establishment.id)
  if (updateError) throw updateError

  log('api:stripe:webhook', 'assinatura da plataforma confirmada', { establishmentId: establishment.id, periodEnd })

  await recordCommissionIfReferred(admin, {
    establishmentId: establishment.id,
    invoice,
  })
}

// Grava a comissão do divulgador (se houver indicação vinculada) só pra
// relatório -- a Stripe já fez o split de verdade na própria cobrança
// via application_fee_percent/transfer_data (lib/stripe.ts), calculado
// sozinho em cima do mesmo percentual_comissao que a gente já tinha
// salvo no momento do checkout (app/api/subscription/create-payment).
// Recalcular aqui em vez de tentar ler de volta o valor da Stripe evita
// depender de onde exatamente a API expõe o fee (isso mudou de lugar
// entre versões) -- os dois lados usam o mesmo percentual, então o
// resultado é idêntico. Idempotente por stripe_invoice_id (UNIQUE na
// tabela): reenvio do mesmo evento pela Stripe nunca duplica a comissão.
async function recordCommissionIfReferred(
  admin: SupabaseClient,
  { establishmentId, invoice }: { establishmentId: string; invoice: Stripe.Invoice }
) {
  const { data: indicacao } = await admin
    .from('indicacoes')
    .select('divulgador_id, divulgadores!inner(percentual_comissao, stripe_onboarding_completo)')
    .eq('estabelecimento_id', establishmentId)
    .maybeSingle()

  if (!indicacao) return
  const divulgador = (indicacao as any).divulgadores
  if (!divulgador?.stripe_onboarding_completo) return // sem onboarding completo, checkout não aplicou split nenhum

  const valorAssinatura = invoice.amount_paid / 100
  const percentualAplicado = Number(divulgador.percentual_comissao)
  const valorComissao = calculateCommissionAmount(valorAssinatura, percentualAplicado)

  const { error } = await admin.from('comissoes').insert({
    divulgador_id: indicacao.divulgador_id,
    estabelecimento_id: establishmentId,
    stripe_invoice_id: invoice.id,
    valor_assinatura: valorAssinatura,
    percentual_aplicado: percentualAplicado,
    valor_comissao: valorComissao,
    status: 'confirmada',
  })

  if (error) {
    // 23505 = unique_violation em stripe_invoice_id -> outro envio do
    // mesmo evento já gravou essa comissão antes, ignora.
    if (error.code === '23505') return
    throw error
  }

  log('api:stripe:webhook', 'comissão registrada', { divulgadorId: indicacao.divulgador_id, valorComissao })
}

// Cancelamento: mesma filosofia da migration 032 (get_my_subscription_status)
// -- nunca guarda um "status cancelado" separado, só deixa
// current_period_end refletir o fim de verdade. Setar pra agora bloqueia
// o painel imediatamente, sem esperar um cron.
async function handleSubscriptionDeleted(admin: SupabaseClient, subscription: Stripe.Subscription) {
  const { error } = await admin
    .from('establishments')
    .update({ current_period_end: new Date().toISOString() })
    .eq('stripe_subscription_id', subscription.id)
  if (error) throw error

  log('api:stripe:webhook', 'assinatura da plataforma cancelada', { subscriptionId: subscription.id })
}
