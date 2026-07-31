import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPlatformPixPayment, getPlatformAccessToken } from '@/lib/mercadoPago'
import { getBaseUrl } from '@/lib/baseUrl'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'

// Chamada pelo lojista logado (nunca pública, diferente de
// /api/mercadopago/create-payment) pra pagar a própria mensalidade da
// plataforma. A sessão identifica o dono, então nem precisa de
// establishmentId no corpo — sempre a loja de quem está logado.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const admin = createAdminClient()

    const { data: establishment, error: estError } = await admin
      .from('establishments')
      .select('id, name, subscription_status')
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

    const amount = Number(settings.monthly_price)

    const { data: payment, error: insertError } = await admin
      .from('subscription_payments')
      .insert({ establishment_id: establishment.id, amount, status: 'pending' })
      .select('id')
      .single()
    if (insertError) throw insertError

    const accessToken = await getPlatformAccessToken(admin)

    const checkoutHost = new URL(getBaseUrl()).hostname
    const mpPayment = await createPlatformPixPayment({
      accessToken,
      amount,
      description: `Assinatura CatalogAI - ${establishment.name}`,
      payerEmail: `assinatura-${establishment.id}@checkout.${checkoutHost}`,
      payerFirstName: establishment.name || 'Estabelecimento',
      externalReference: payment.id,
      notificationUrl: `${getBaseUrl()}/api/mercadopago/webhook`,
      idempotencyKey: payment.id,
    })

    const { error: updateError } = await admin
      .from('subscription_payments')
      .update({ mercadopago_payment_id: mpPayment.paymentId })
      .eq('id', payment.id)
    if (updateError) throw updateError

    await admin
      .from('establishments')
      .update({ subscription_pix_payment_id: mpPayment.paymentId })
      .eq('id', establishment.id)

    return NextResponse.json({ qrCode: mpPayment.qrCode, qrCodeBase64: mpPayment.qrCodeBase64 })
  } catch (err: any) {
    logError('api:subscription:create-payment', 'erro ao criar cobrança de assinatura', err)
    return NextResponse.json({ error: err.message || 'Erro ao criar cobrança de assinatura' }, { status: 500 })
  }
}
