import { NextRequest, NextResponse } from 'next/server'
import { sendOrderPush } from '@/lib/orderPush'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'

// Notifica quem ativou push nesse PEDIDO específico (página pública
// /pedido/[id]) que o status mudou. Sem autenticação de dono — o
// `order_id` (UUID imprevisível) já é a credencial, mesmo modelo de
// `get_order_status`. De propósito NUNCA aceita título/corpo vindos do
// chamador: o texto é sempre derivado do estado atual do pedido no banco.
export async function POST(request: NextRequest) {
  let body: { order_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (!body.order_id) {
    return NextResponse.json({ error: 'order_id é obrigatório' }, { status: 400 })
  }

  try {
    const result = await sendOrderPush(body.order_id)
    return NextResponse.json(result)
  } catch (err) {
    logError('api:push:send-order', 'erro ao processar envio de push do pedido', err)
    return NextResponse.json({ error: 'Erro ao enviar notificação' }, { status: 500 })
  }
}
