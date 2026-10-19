import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendOrderPush } from '@/lib/orderPush'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Avisa o cliente que o status do pedido mudou. Sem autenticação de dono:
// o `order_id` (UUID imprevisível) é a credencial, mesmo modelo de
// `get_order_status`. NUNCA aceita título/corpo do chamador: o texto sai
// do estado atual do pedido no banco. Limite por pedido para ninguém usar
// o link do pedido para disparar o mesmo aviso sem parar.
export async function POST(request: NextRequest) {
  let body: { order_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (!body.order_id || !UUID.test(body.order_id)) {
    return NextResponse.json({ error: 'order_id é obrigatório' }, { status: 400 })
  }

  try {
    const { data: allowed } = await createAdminClient().rpc('check_rate_limit', {
      p_scope: 'push_send_order',
      p_key: body.order_id,
      p_max_count: 12,
      p_window: '1 hour',
    })
    if (allowed === false) return NextResponse.json({ sent: 0, message: 'Limite de avisos deste pedido atingido' }, { status: 429 })

    const result = await sendOrderPush(body.order_id)
    return NextResponse.json(result)
  } catch (err) {
    logError('api:push:send-order', 'erro ao processar envio de push do pedido', err)
    return NextResponse.json({ error: 'Erro ao enviar notificação' }, { status: 500 })
  }
}
