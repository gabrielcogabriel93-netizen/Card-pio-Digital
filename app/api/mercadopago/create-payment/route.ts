import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPixPayment, getPayment, getValidAccessToken } from '@/lib/mercadoPago'
import { getBaseUrl } from '@/lib/baseUrl'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'

interface CreatePaymentBody {
  orderId: string
}

// Chamada pelo próprio cliente (sem login) logo depois de criar o pedido
// com forma de pagamento "Pix automático". Não precisa de autenticação de
// dono — o `orderId` é um UUID não adivinhável, mesmo modelo de segurança
// que `get_order_status`/`/pedido/[id]` já usam hoje.
export async function POST(request: NextRequest) {
  let body: CreatePaymentBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (!body.orderId) {
    return NextResponse.json({ error: 'orderId é obrigatório' }, { status: 400 })
  }

  const admin = createAdminClient()

  try {
    const { data: order, error: orderError } = await admin
      .from('orders')
      .select('*')
      .eq('id', body.orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
    }
    if (order.payment_method !== 'mercadopago_pix') {
      return NextResponse.json({ error: 'Esse pedido não usa pagamento automático' }, { status: 400 })
    }
    if (order.status !== 'pending') {
      return NextResponse.json({ error: 'Esse pedido já foi processado' }, { status: 400 })
    }

    const accessToken = await getValidAccessToken(admin, order.establishment_id)

    // Já existe uma cobrança pra esse pedido — se ainda estiver dentro da
    // validade (pending/approved), reaproveita o mesmo QR em vez de criar
    // uma cobrança nova (evita duplo-clique gerando 2 cobranças pro
    // cliente).
    if (order.mercadopago_payment_id) {
      const existing = await getPayment(accessToken, order.mercadopago_payment_id)
      if ((existing.status === 'pending' || existing.status === 'approved') && existing.qrCode) {
        return NextResponse.json({ qrCode: existing.qrCode, qrCodeBase64: existing.qrCodeBase64 })
      }
    }

    const { data: establishment } = await admin
      .from('establishments')
      .select('name, slug')
      .eq('id', order.establishment_id)
      .single()

    const checkoutHost = new URL(getBaseUrl()).hostname
    const payment = await createPixPayment({
      accessToken,
      amount: Number(order.total),
      description: `Pedido #${order.id.slice(0, 8)} - ${establishment?.name || 'Cardápio'}`,
      payerEmail: `pedido-${order.id}@checkout.${checkoutHost}`,
      payerFirstName: order.customer_name || 'Cliente',
      externalReference: order.id,
      notificationUrl: `${getBaseUrl()}/api/mercadopago/webhook`,
      idempotencyKey: order.id,
    })

    const { error: updateError } = await admin
      .from('orders')
      .update({ mercadopago_payment_id: payment.paymentId, payment_status: 'pending' })
      .eq('id', order.id)
    if (updateError) throw updateError

    return NextResponse.json({ qrCode: payment.qrCode, qrCodeBase64: payment.qrCodeBase64 })
  } catch (err: any) {
    logError('api:mercadopago:create-payment', 'erro ao criar pagamento Pix', err)
    return NextResponse.json({ error: err.message || 'Erro ao criar pagamento' }, { status: 500 })
  }
}
