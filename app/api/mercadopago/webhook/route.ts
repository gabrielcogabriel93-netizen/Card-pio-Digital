import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayment, getPlatformAccessToken, getValidAccessToken, verifyWebhookSignature } from '@/lib/mercadoPago'
import { resolveAutoConfirmStatus, applyAutomaticOrderConfirmation } from '@/lib/orderAutoConfirm'
import { log, logError } from '@/lib/logger'
import type { Order } from '@/types'

export const runtime = 'nodejs'

// O Mercado Pago chama essa rota toda vez que o status de um pagamento
// muda. Tem dinheiro envolvido, então: (1) a assinatura é sempre validada
// antes de mexer em qualquer coisa, (2) o status nunca é lido do payload
// do webhook — sempre confirmado de novo direto na API do MP, (3) toda
// escrita é condicional em `payment_status = 'pending'`, pra um reenvio
// duplicado (comum em webhooks) nunca lançar financeiro/baixar estoque
// duas vezes.
export async function POST(request: NextRequest) {
  let payload: any
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const dataId = payload?.data?.id ? String(payload.data.id) : ''
  if (!dataId) {
    return NextResponse.json({ ok: true }) // notificação sem id de pagamento, nada a fazer
  }

  const isValidSignature = verifyWebhookSignature({
    xSignature: request.headers.get('x-signature'),
    xRequestId: request.headers.get('x-request-id'),
    dataId,
    secret: process.env.MERCADOPAGO_WEBHOOK_SECRET || '',
  })
  if (!isValidSignature) {
    logError('api:mercadopago:webhook', 'assinatura inválida', { dataId })
    return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 })
  }

  if (payload.type !== 'payment') {
    return NextResponse.json({ ok: true })
  }

  const admin = createAdminClient()

  try {
    const { data: order } = await admin
      .from('orders')
      .select('*')
      .eq('mercadopago_payment_id', dataId)
      .maybeSingle()

    if (!order) {
      return handleSubscriptionPaymentWebhook(admin, dataId)
    }

    const { data: establishment } = await admin
      .from('establishments')
      .select('order_tracking_enabled, whatsapp_notifications_enabled')
      .eq('id', order.establishment_id)
      .single()

    const accessToken = await getValidAccessToken(admin, order.establishment_id)
    const payment = await getPayment(accessToken, dataId)

    if (payment.status === 'approved') {
      const newStatus = resolveAutoConfirmStatus(establishment?.order_tracking_enabled ?? true)

      const { data: updatedOrder, error: updateError } = await admin
        .from('orders')
        .update({ payment_status: 'approved', status: newStatus })
        .eq('id', order.id)
        .eq('payment_status', 'pending')
        .select()
        .maybeSingle()
      if (updateError) throw updateError

      // maybeSingle() sem linha = outra chamada do webhook já processou
      // esse pagamento antes — não repete os efeitos colaterais.
      if (updatedOrder) {
        await applyAutomaticOrderConfirmation(admin, updatedOrder as Order, newStatus, {
          whatsapp_notifications_enabled: establishment?.whatsapp_notifications_enabled ?? false,
        })
        log('api:mercadopago:webhook', 'pedido confirmado automaticamente', { orderId: order.id, newStatus })
      }
    } else if (payment.status === 'rejected' || payment.status === 'cancelled') {
      await admin
        .from('orders')
        .update({ payment_status: payment.status })
        .eq('id', order.id)
        .eq('payment_status', 'pending')
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    logError('api:mercadopago:webhook', 'erro ao processar webhook', err)
    // 500 de propósito — o Mercado Pago reenvia notificações que falharam,
    // o que é o comportamento certo pra uma falha transitória nossa.
    return NextResponse.json({ error: 'Erro ao processar webhook' }, { status: 500 })
  }
}

// Segundo caminho: o pagamento não é de nenhum pedido de cliente final —
// pode ser a mensalidade de um lojista pra própria plataforma (migration
// 032). Usa o token DA PLATAFORMA (client_credentials), não o de um
// estabelecimento, porque quem recebeu esse Pix foi a própria aplicação.
// Não precisa de uma segunda Webhook URL cadastrada no Mercado Pago — as
// duas notificações chegam na mesma rota.
async function handleSubscriptionPaymentWebhook(admin: SupabaseClient, dataId: string) {
  try {
    const { data: subscriptionPayment } = await admin
      .from('subscription_payments')
      .select('*')
      .eq('mercadopago_payment_id', dataId)
      .maybeSingle()

    if (!subscriptionPayment) {
      log('api:mercadopago:webhook', 'pagamento não corresponde a pedido nem a assinatura conhecidos', { dataId })
      return NextResponse.json({ ok: true })
    }

    const accessToken = await getPlatformAccessToken(admin)
    const payment = await getPayment(accessToken, dataId)

    if (payment.status === 'approved') {
      const periodStart = new Date()
      const periodEnd = new Date(periodStart.getTime())
      periodEnd.setMonth(periodEnd.getMonth() + 1)

      const { data: updatedPayment, error: updateError } = await admin
        .from('subscription_payments')
        .update({ status: 'approved', period_start: periodStart.toISOString(), period_end: periodEnd.toISOString() })
        .eq('id', subscriptionPayment.id)
        .eq('status', 'pending')
        .select()
        .maybeSingle()
      if (updateError) throw updateError

      // Sem linha atualizada = outra chamada do webhook já processou esse
      // pagamento antes — não reabre o período de novo.
      if (updatedPayment) {
        await admin
          .from('establishments')
          .update({ subscription_status: 'active', current_period_end: periodEnd.toISOString() })
          .eq('id', subscriptionPayment.establishment_id)
        log('api:mercadopago:webhook', 'assinatura confirmada', {
          establishmentId: subscriptionPayment.establishment_id,
          periodEnd: periodEnd.toISOString(),
        })
      }
    } else if (payment.status === 'rejected' || payment.status === 'cancelled') {
      await admin
        .from('subscription_payments')
        .update({ status: payment.status })
        .eq('id', subscriptionPayment.id)
        .eq('status', 'pending')
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    logError('api:mercadopago:webhook', 'erro ao processar webhook de assinatura', err)
    return NextResponse.json({ error: 'Erro ao processar webhook' }, { status: 500 })
  }
}
