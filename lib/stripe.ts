// Cliente da Stripe (Billing + Connect), chamado só de rotas de servidor
// (app/api/subscription/create-payment, app/api/stripe/webhook,
// app/api/divulgador/**) — nunca do browser, porque carrega
// STRIPE_SECRET_KEY.
//
// Usado só pra COBRANÇA DA MENSALIDADE DA PLATAFORMA (o que o
// estabelecimento paga pro CatalogAI) + split de comissão pro
// divulgador. O pagamento que cada estabelecimento recebe dos PRÓPRIOS
// clientes continua 100% Mercado Pago (lib/mercadoPago.ts), sem relação
// nenhuma com este arquivo.
//
// SDK oficial (diferente de lib/mercadoPago.ts, que usa fetch puro por
// escolha documentada lá) porque aqui vamos usar Billing + Connect +
// verificação de assinatura de webhook, superfície grande o bastante pra
// justificar a dependência.

import Stripe from 'stripe'

let cachedClient: Stripe | null = null

export function getStripeClient(): Stripe {
  if (cachedClient) return cachedClient

  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error('Stripe não configurado (STRIPE_SECRET_KEY ausente).')
  }

  // Sem apiVersion explícita: usa a versão travada pelo próprio pacote
  // `stripe` instalado (ver node_modules/stripe/cjs/apiVersion.d.ts) —
  // evita hardcodar uma data que fica defasada a cada upgrade do SDK.
  cachedClient = new Stripe(secretKey)
  return cachedClient
}

export interface DivulgadorForConnect {
  id: string
  email: string
  nome: string
}

/**
 * Cria a conta conectada Express do divulgador — dados bancários e KYC
 * ficam só na Stripe, nunca no nosso banco. Chamada uma única vez, no
 * cadastro (app/api/divulgador/cadastro).
 */
export async function createConnectedAccount(divulgador: DivulgadorForConnect): Promise<string> {
  const stripe = getStripeClient()
  const account = await stripe.accounts.create({
    type: 'express',
    email: divulgador.email,
    business_type: 'individual',
    capabilities: {
      transfers: { requested: true },
    },
    metadata: { divulgadorId: divulgador.id },
  })
  return account.id
}

export interface AccountLinkParams {
  accountId: string
  refreshUrl: string
  returnUrl: string
}

/**
 * URL do onboarding hospedado pela própria Stripe. Chamada tanto no
 * cadastro quanto sempre que o divulgador ainda não completou (o link
 * expira rápido, então cada retomada gera um novo).
 */
export async function createAccountLink(params: AccountLinkParams): Promise<string> {
  const stripe = getStripeClient()
  const link = await stripe.accountLinks.create({
    account: params.accountId,
    refresh_url: params.refreshUrl,
    return_url: params.returnUrl,
    type: 'account_onboarding',
  })
  return link.url
}

/**
 * Confirma direto na Stripe se a conta conectada já pode receber
 * transferência (não confia só no retorno da return_url — o divulgador
 * pode fechar a aba antes de terminar). Usada no callback de retorno e
 * pode ser chamada de novo a qualquer momento pra reconciliar.
 */
export async function isAccountReadyForTransfers(accountId: string): Promise<boolean> {
  const stripe = getStripeClient()
  const account = await stripe.accounts.retrieve(accountId)
  return account.capabilities?.transfers === 'active'
}

export interface CreateSubscriptionCheckoutParams {
  establishmentId: string
  establishmentName: string
  ownerEmail: string
  amount: number // em reais (ex: 49.90)
  successUrl: string
  cancelUrl: string
  stripeCustomerId?: string | null
  // Presente só quando há indicação vinculada E o divulgador já concluiu
  // o onboarding -- caso contrário a assinatura é criada sem split, 100%
  // pra plataforma.
  divulgadorConnect?: { stripeAccountId: string; percentualComissao: number } | null
}

/**
 * Checkout Session de assinatura pra mensalidade da plataforma. Usa
 * price_data inline (sem Price pré-cadastrado na Stripe) pra o valor
 * poder continuar vindo de platform_settings.monthly_price, igual já
 * funciona hoje com o Pix (migration 032) -- se o admin mudar o preço no
 * painel, a próxima assinatura já nasce com o valor novo.
 *
 * payment_method_types fica só em 'card' de propósito: não há garantia
 * de que Pix esteja disponível pra modo assinatura (recorrente) no
 * Brasil na conta Stripe usada -- validar no dashboard antes de
 * adicionar 'pix' aqui.
 */
export async function createSubscriptionCheckoutSession(
  params: CreateSubscriptionCheckoutParams
): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripeClient()

  const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
    metadata: { establishmentId: params.establishmentId },
  }

  if (params.divulgadorConnect) {
    subscriptionData.application_fee_percent = params.divulgadorConnect.percentualComissao
    subscriptionData.transfer_data = { destination: params.divulgadorConnect.stripeAccountId }
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: params.stripeCustomerId || undefined,
    customer_email: params.stripeCustomerId ? undefined : params.ownerEmail,
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'brl',
          product_data: { name: `Assinatura CatalogAI - ${params.establishmentName}` },
          unit_amount: Math.round(params.amount * 100),
          recurring: { interval: 'month' },
        },
        quantity: 1,
      },
    ],
    subscription_data: subscriptionData,
    metadata: { establishmentId: params.establishmentId },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  })

  if (!session.url) {
    throw new Error('Stripe não retornou a URL do Checkout.')
  }

  return { url: session.url, sessionId: session.id }
}

/**
 * Comissão em reais a partir do valor pago e do percentual do
 * divulgador, arredondada ao centavo -- mesma conta que a Stripe faz
 * sozinha ao aplicar `application_fee_percent` na cobrança
 * (createSubscriptionCheckoutSession acima). Extraída como função pura
 * pra dar pra testar sem precisar mockar o SDK da Stripe, e reaproveitada
 * em app/api/stripe/webhook pra gravar `comissoes` (relatório local) com
 * o mesmo número que a Stripe já usou de verdade.
 */
export function calculateCommissionAmount(valorAssinatura: number, percentualComissao: number): number {
  return Math.round(valorAssinatura * percentualComissao) / 100
}

/**
 * Valida a assinatura do webhook (header stripe-signature) com o
 * corpo cru da requisição -- igual em espírito a
 * verifyWebhookSignature em lib/mercadoPago.ts: tem dinheiro envolvido,
 * não dá pra confiar em payload sem assinatura verificada.
 */
export function constructWebhookEvent(rawBody: string | Buffer, signature: string | null): Stripe.Event {
  const stripe = getStripeClient()
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    throw new Error('Stripe não configurado (STRIPE_WEBHOOK_SECRET ausente).')
  }
  if (!signature) {
    throw new Error('Requisição sem assinatura Stripe.')
  }
  return stripe.webhooks.constructEvent(rawBody, signature, secret)
}
