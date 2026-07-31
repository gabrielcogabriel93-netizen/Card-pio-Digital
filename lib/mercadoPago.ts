// Cliente do Mercado Pago (OAuth Connect + Pagamentos Pix), chamado só de
// rotas de servidor (app/api/mercadopago/*) — nunca do browser, porque
// carrega MERCADOPAGO_CLIENT_SECRET / tokens de acesso dos lojistas.
//
// Sem SDK oficial: chamadas via fetch puro, mesmo padrão de
// lib/whatsappServer.ts. A API do Mercado Pago é REST simples o
// suficiente pra não justificar mais uma dependência.

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

const MP_API_BASE = 'https://api.mercadopago.com'

// Comissão fixa da plataforma por pedido pago automaticamente — único
// lugar pra ajustar esse valor no futuro.
export const MERCADOPAGO_COMMISSION_AMOUNT = 1.0

function getOAuthCredentials() {
  const clientId = process.env.MERCADOPAGO_CLIENT_ID
  const clientSecret = process.env.MERCADOPAGO_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Mercado Pago não configurado (MERCADOPAGO_CLIENT_ID / MERCADOPAGO_CLIENT_SECRET ausentes).')
  }
  return { clientId, clientSecret }
}

export function buildAuthorizationUrl(redirectUri: string, state: string): string {
  const { clientId } = getOAuthCredentials()
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    platform_id: 'mp',
    redirect_uri: redirectUri,
    state,
  })
  return `https://auth.mercadopago.com/authorization?${params.toString()}`
}

interface OAuthTokenResponse {
  access_token: string
  refresh_token: string
  user_id: number
  public_key?: string
  expires_in: number // segundos
}

async function requestOAuthToken(body: Record<string, string>): Promise<OAuthTokenResponse> {
  const response = await fetch(`${MP_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.message || `Erro ao comunicar com o OAuth do Mercado Pago (${response.status})`)
  }
  return data as OAuthTokenResponse
}

export function exchangeCodeForToken(code: string, redirectUri: string): Promise<OAuthTokenResponse> {
  const { clientId, clientSecret } = getOAuthCredentials()
  return requestOAuthToken({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  })
}

export function refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse> {
  const { clientId, clientSecret } = getOAuthCredentials()
  return requestOAuthToken({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
}

/**
 * Devolve um access_token válido pro estabelecimento, renovando via
 * refresh_token quando estiver perto de vencer. Usada tanto na criação do
 * pagamento quanto no webhook — único lugar com essa lógica.
 */
export async function getValidAccessToken(admin: SupabaseClient, establishmentId: string): Promise<string> {
  const { data: account, error } = await admin
    .from('mercadopago_accounts')
    .select('access_token, refresh_token, expires_at')
    .eq('establishment_id', establishmentId)
    .eq('is_active', true)
    .maybeSingle()

  if (error || !account) {
    throw new Error('Este estabelecimento não tem Mercado Pago conectado.')
  }

  const expiresAt = new Date(account.expires_at).getTime()
  // Renova um pouco antes de vencer pra não correr risco de usar um token
  // que expira entre a checagem e a chamada de verdade.
  if (expiresAt - Date.now() > 5 * 60 * 1000) {
    return account.access_token
  }

  let refreshed: OAuthTokenResponse
  try {
    refreshed = await refreshAccessToken(account.refresh_token)
  } catch (err) {
    // Refresh falhou de vez (token revogado, app desconectado pelo lojista
    // direto no Mercado Pago, etc.) — desativa a conexão em vez de deixar
    // pedido após pedido falhando em silêncio. Isso já faz o Pix
    // automático sumir sozinho do cardápio e o card de Configurações
    // mostrar "desconectado", deixando óbvio que precisa reconectar.
    await admin.from('mercadopago_accounts').update({ is_active: false }).eq('establishment_id', establishmentId)
    throw new Error('A conexão com o Mercado Pago desse estabelecimento expirou e precisa ser refeita.')
  }

  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
  const { error: updateError } = await admin
    .from('mercadopago_accounts')
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: newExpiresAt,
    })
    .eq('establishment_id', establishmentId)
  if (updateError) throw updateError

  return refreshed.access_token
}

/**
 * Token da PRÓPRIA plataforma (grant client_credentials, não OAuth de
 * lojista nenhum) — usado só pra cobrar a mensalidade dos lojistas
 * (migration 032). Diferente de getValidAccessToken: aqui não tem
 * refresh_token, o grant é trocado de novo quando o token cacheado em
 * platform_settings estiver perto de vencer.
 */
export async function getPlatformAccessToken(admin: SupabaseClient): Promise<string> {
  const { data: settings, error } = await admin
    .from('platform_settings')
    .select('platform_access_token, platform_token_expires_at')
    .eq('id', true)
    .single()

  if (error) throw error

  if (settings.platform_access_token && settings.platform_token_expires_at) {
    const expiresAt = new Date(settings.platform_token_expires_at).getTime()
    if (expiresAt - Date.now() > 5 * 60 * 1000) {
      return settings.platform_access_token
    }
  }

  const { clientId, clientSecret } = getOAuthCredentials()
  const token = await requestOAuthToken({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  })

  const newExpiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString()
  await admin
    .from('platform_settings')
    .update({ platform_access_token: token.access_token, platform_token_expires_at: newExpiresAt })
    .eq('id', true)

  return token.access_token
}

export interface CreatePixPaymentParams {
  accessToken: string
  amount: number
  description: string
  payerEmail: string
  payerFirstName: string
  externalReference: string
  notificationUrl: string
  idempotencyKey: string
}

export interface PixPaymentResult {
  paymentId: string
  status: string
  qrCode: string
  qrCodeBase64: string
}

export async function createPixPayment(params: CreatePixPaymentParams): Promise<PixPaymentResult> {
  const response = await fetch(`${MP_API_BASE}/v1/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.accessToken}`,
      'X-Idempotency-Key': params.idempotencyKey,
    },
    body: JSON.stringify({
      transaction_amount: Number(params.amount.toFixed(2)),
      description: params.description,
      payment_method_id: 'pix',
      payer: { email: params.payerEmail, first_name: params.payerFirstName },
      application_fee: MERCADOPAGO_COMMISSION_AMOUNT,
      external_reference: params.externalReference,
      notification_url: params.notificationUrl,
    }),
    cache: 'no-store',
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.message || `Erro ao criar pagamento Pix no Mercado Pago (${response.status})`)
  }

  const transactionData = data.point_of_interaction?.transaction_data
  if (!transactionData?.qr_code) {
    throw new Error('Mercado Pago não retornou o QR code do Pix.')
  }

  return {
    paymentId: String(data.id),
    status: data.status,
    qrCode: transactionData.qr_code,
    qrCodeBase64: transactionData.qr_code_base64,
  }
}

export interface CreatePlatformPixPaymentParams {
  accessToken: string
  amount: number
  description: string
  payerEmail: string
  payerFirstName: string
  externalReference: string
  notificationUrl: string
  idempotencyKey: string
}

/**
 * Cobrança da mensalidade do lojista pra própria plataforma (migration
 * 032) — mesma chamada de createPixPayment, mas SEM application_fee:
 * aqui não é split entre duas contas, é venda direta da plataforma (que
 * já é a dona da conta associada ao accessToken) pro lojista.
 */
export async function createPlatformPixPayment(params: CreatePlatformPixPaymentParams): Promise<PixPaymentResult> {
  const response = await fetch(`${MP_API_BASE}/v1/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.accessToken}`,
      'X-Idempotency-Key': params.idempotencyKey,
    },
    body: JSON.stringify({
      transaction_amount: Number(params.amount.toFixed(2)),
      description: params.description,
      payment_method_id: 'pix',
      payer: { email: params.payerEmail, first_name: params.payerFirstName },
      external_reference: params.externalReference,
      notification_url: params.notificationUrl,
    }),
    cache: 'no-store',
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.message || `Erro ao criar cobrança de assinatura no Mercado Pago (${response.status})`)
  }

  const transactionData = data.point_of_interaction?.transaction_data
  if (!transactionData?.qr_code) {
    throw new Error('Mercado Pago não retornou o QR code do Pix.')
  }

  return {
    paymentId: String(data.id),
    status: data.status,
    qrCode: transactionData.qr_code,
    qrCodeBase64: transactionData.qr_code_base64,
  }
}

export interface MercadoPagoUserInfo {
  email: string | null
}

// Usado logo após o OAuth callback só pra guardar um e-mail "conectado
// como fulano@..." no painel — não afeta nada do fluxo de pagamento.
export async function getUserInfo(accessToken: string): Promise<MercadoPagoUserInfo> {
  const response = await fetch(`${MP_API_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    return { email: null }
  }
  return { email: data.email ?? null }
}

export interface PaymentLookupResult {
  status: string
  externalReference: string | null
  // Só vem preenchido pra pagamentos Pix ainda dentro da validade — usado
  // pra reexibir o mesmo QR numa nova tentativa sem criar outra cobrança.
  qrCode?: string
  qrCodeBase64?: string
}

export async function getPayment(accessToken: string, paymentId: string): Promise<PaymentLookupResult> {
  const response = await fetch(`${MP_API_BASE}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.message || `Erro ao consultar pagamento no Mercado Pago (${response.status})`)
  }
  const transactionData = data.point_of_interaction?.transaction_data
  return {
    status: data.status,
    externalReference: data.external_reference ?? null,
    qrCode: transactionData?.qr_code,
    qrCodeBase64: transactionData?.qr_code_base64,
  }
}

interface VerifyWebhookSignatureParams {
  xSignature: string | null
  xRequestId: string | null
  dataId: string
  secret: string
}

/**
 * Valida a assinatura que o Mercado Pago manda em todo webhook
 * (`x-signature: ts=...,v1=...`), seguindo o algoritmo documentado pelo
 * MP: HMAC-SHA256 do manifest `id:{data.id};request-id:{x-request-id};ts:{ts};`
 * com o segredo configurado na aplicação. Sem isso, qualquer um poderia
 * forjar uma chamada dizendo "esse pedido foi pago" — tem dinheiro
 * envolvido, então não dá pra confiar num header simples.
 */
export function verifyWebhookSignature({ xSignature, xRequestId, dataId, secret }: VerifyWebhookSignatureParams): boolean {
  if (!xSignature || !xRequestId || !secret) return false

  const parts: Record<string, string> = {}
  xSignature.split(',').forEach((chunk) => {
    const [key, value] = chunk.split('=')
    if (key && value) parts[key.trim()] = value.trim()
  })
  const { ts, v1 } = parts
  if (!ts || !v1) return false

  const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${ts};`
  const expected = createHmac('sha256', secret).update(manifest).digest('hex')

  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(v1)
  if (expectedBuffer.length !== receivedBuffer.length) return false
  return timingSafeEqual(expectedBuffer, receivedBuffer)
}
