import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOwnerAccess } from '@/lib/adminAccess'
import { getWebPush } from '@/lib/webpush'

export const runtime = 'nodejs'

// Liga os avisos neste aparelho (só o dono) e manda um push de teste.
export async function POST(request: NextRequest) {
  const access = await requireOwnerAccess()
  if (!access) return NextResponse.json({ error: 'Só o dono da plataforma recebe os avisos.' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  if (!body.endpoint || !body.p256dh || !body.auth) return NextResponse.json({ error: 'Inscrição inválida.' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from('owner_push_subscriptions').upsert({
    endpoint: body.endpoint, p256dh: body.p256dh, auth: body.auth, user_email: access.email, last_ok_at: new Date().toISOString(),
  })
  if (error) return NextResponse.json({ error: 'Não foi possível salvar o aparelho.' }, { status: 500 })

  try {
    await getWebPush().sendNotification(
      { endpoint: body.endpoint, keys: { p256dh: body.p256dh, auth: body.auth } },
      JSON.stringify({ title: 'Avisos do Freguês ativados', body: 'Você vai receber aqui os cadastros, pagamentos e alertas da plataforma.', url: '/admin/crescimento' })
    )
  } catch {
    // o aparelho fica salvo; o teste é só cortesia
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const access = await requireOwnerAccess()
  if (!access) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  if (body.endpoint) await createAdminClient().from('owner_push_subscriptions').delete().eq('endpoint', body.endpoint).eq('user_email', access.email)
  return NextResponse.json({ ok: true })
}
