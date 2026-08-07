import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'
import { getWebPush } from '@/lib/webpush'
import { logError } from '@/lib/logger'
import { safeCompareSecret } from '@/lib/safeCompare'

export const runtime = 'nodejs'

interface SendPushBody {
  establishment_id: string
  order_id?: string
  customer_name?: string
  total?: number
  test?: boolean
}

// Confirma que quem chamou é o próprio trigger do banco (segredo
// compartilhado) OU o dono logado do estabelecimento (botão de teste no
// painel). Sem isso, qualquer pessoa poderia bater nessa rota e mandar
// notificação pra qualquer loja.
async function isAuthorized(request: NextRequest, establishmentId: string): Promise<boolean> {
  const secretHeader = request.headers.get('x-push-secret')
  if (safeCompareSecret(secretHeader, process.env.PUSH_TRIGGER_SECRET)) {
    return true
  }

  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { data: est } = await supabase
      .from('establishments')
      .select('id')
      .eq('owner_id', user.id)
      .eq('id', establishmentId)
      .maybeSingle()

    return !!est
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  let body: SendPushBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (!body.establishment_id) {
    return NextResponse.json({ error: 'establishment_id é obrigatório' }, { status: 400 })
  }

  if (!(await isAuthorized(request, body.establishment_id))) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: subscriptions, error } = await admin
    .from('push_subscriptions')
    .select('*')
    .eq('establishment_id', body.establishment_id)

  if (error) {
    logError('api:push:send', 'erro ao buscar inscrições', error)
    return NextResponse.json({ error: 'Erro ao buscar inscrições' }, { status: 500 })
  }

  if (!subscriptions || subscriptions.length === 0) {
    return NextResponse.json({ sent: 0, message: 'Nenhuma inscrição ativa para esta loja' })
  }

  const payload = JSON.stringify(
    body.test
      ? { title: 'Notificação de teste', body: 'Se você está vendo isso, as notificações estão funcionando!', url: '/painel/pedidos' }
      : {
          title: 'Novo pedido recebido!',
          body: body.customer_name
            ? `${body.customer_name} — ${body.total ? `R$ ${Number(body.total).toFixed(2)}` : 'novo pedido'}`
            : 'Você recebeu um novo pedido.',
          url: '/painel/pedidos',
        }
  )

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
        // 404/410 = inscrição expirada/revogada (usuário desinstalou, trocou
        // de navegador etc.) — limpa pra não tentar de novo pra sempre.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          staleIds.push(sub.id)
        } else {
          logError('api:push:send', 'erro ao enviar push', err)
        }
      }
    })
  )

  if (staleIds.length > 0) {
    await admin.from('push_subscriptions').delete().in('id', staleIds)
  }

  return NextResponse.json({ sent, removed: staleIds.length, total: subscriptions.length })
}
