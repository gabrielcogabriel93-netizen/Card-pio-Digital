import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayment, getValidAccessToken, verifyWebhookSignature } from '@/lib/mercadoPago'
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
      log('api:mercadopago:webhook', 'pagamento não corresponde a nenhum pedido conhecido', { dataId })
      return NextResponse.json({ ok: true })
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
