import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWebPush } from '@/lib/webpush'
import { STATUS_NOTIFICATION_MESSAGES } from '@/lib/orderStatusMessages'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'

interface SendOrderPushBody {
  order_id: string
}

// Notifica quem ativou push nesse PEDIDO específico (página pública
// /pedido/[id]) que o status mudou. Sem autenticação de dono — o
// `order_id` (UUID imprevisível) já é a credencial, mesmo modelo de
// `get_order_status`/`create-payment`. De propósito NUNCA aceita
// título/corpo vindos do chamador: o texto é sempre derivado do status
// atual do pedido no banco (STATUS_NOTIFICATION_MESSAGES, o mesmo usado
// pro WhatsApp), pra ninguém conseguir usar essa rota pra mandar
// mensagem arbitrária pra quem se inscreveu.
export async function POST(request: NextRequest) {
  let body: SendOrderPushBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (!body.order_id) {
    return NextResponse.json({ error: 'order_id é obrigatório' }, { status: 400 })
  }

  const admin = createAdminClient()

  try {
    const { data: order, error: orderError } = await admin
      .from('orders')
      .select('id, status, order_type')
      .eq('id', body.order_id)
      .maybeSingle()

    if (orderError) throw orderError
    if (!order) {
      return NextResponse.json({ sent: 0, message: 'Pedido não encontrado' })
    }

    const message = STATUS_NOTIFICATION_MESSAGES[order.status as keyof typeof STATUS_NOTIFICATION_MESSAGES]?.(order)
    if (!message) {
      return NextResponse.json({ sent: 0, message: 'Sem notificação pra esse status' })
    }

    const { data: subscriptions, error: subsError } = await admin
      .from('order_push_subscriptions')
      .select('*')
      .eq('order_id', order.id)

    if (subsError) throw subsError
    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ sent: 0, message: 'Nenhuma inscrição ativa para esse pedido' })
    }

    const payload = JSON.stringify({
      title: 'Atualização do seu pedido',
      body: message,
      url: `/pedido/${order.id}`,
    })

    const webpush = getWebPush()
    let sent = 0
    const staleIds: string[] = []

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          )
          sent++
        } catch (err: any) {
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            staleIds.push(sub.id)
          } else {
            logError('api:push:send-order', 'erro ao enviar push', err)
          }
        }
      })
    )

    if (staleIds.length > 0) {
      await admin.from('order_push_subscriptions').delete().in('id', staleIds)
    }

    return NextResponse.json({ sent, removed: staleIds.length, total: subscriptions.length })
  } catch (err) {
    logError('api:push:send-order', 'erro ao processar envio de push do pedido', err)
    return NextResponse.json({ error: 'Erro ao enviar notificação' }, { status: 500 })
  }
}
