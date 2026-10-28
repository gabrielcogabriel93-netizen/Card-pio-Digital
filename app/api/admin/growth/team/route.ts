import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOwnerAccess } from '@/lib/adminAccess'
import { isPlatformAdminEmail } from '@/lib/platformAdmin'
import { addOwnerAlert } from '@/lib/ownerAlerts'

export const runtime = 'nodejs'

// Equipe de crescimento: só o dono adiciona ou remove. Quem entra vê a
// aba Crescimento (métricas, contatos, suporte), sem cobrança nem planos.
export async function GET() {
  const access = await requireOwnerAccess()
  if (!access) return NextResponse.json({ error: 'Só o dono da plataforma gerencia a equipe.' }, { status: 403 })
  const { data, error } = await createAdminClient().from('platform_team').select('*').order('created_at')
  if (error) return NextResponse.json({ error: 'Não foi possível carregar a equipe.' }, { status: 500 })
  return NextResponse.json({ team: data })
}

export async function POST(request: NextRequest) {
  const access = await requireOwnerAccess()
  if (!access) return NextResponse.json({ error: 'Só o dono da plataforma gerencia a equipe.' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 })
  if (isPlatformAdminEmail(email)) return NextResponse.json({ error: 'Esse e-mail já é dono da plataforma.' }, { status: 400 })
  const admin = createAdminClient()
  const { error } = await admin.from('platform_team').upsert({ email, name: body.name ? String(body.name).slice(0, 80) : null, added_by: access.email })
  if (error) return NextResponse.json({ error: 'Não foi possível adicionar.' }, { status: 500 })
  await addOwnerAlert(admin, { kind: 'admin', title: 'Equipe: acesso liberado', body: `${email} agora vê a aba Crescimento.`, url: '/admin/crescimento?aba=equipe' })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const access = await requireOwnerAccess()
  if (!access) return NextResponse.json({ error: 'Só o dono da plataforma gerencia a equipe.' }, { status: 403 })
  const email = (request.nextUrl.searchParams.get('email') || '').toLowerCase()
  const admin = createAdminClient()
  const { error } = await admin.from('platform_team').delete().eq('email', email)
  if (error) return NextResponse.json({ error: 'Não foi possível remover.' }, { status: 500 })
  await addOwnerAlert(admin, { kind: 'admin', title: 'Equipe: acesso removido', body: email, url: '/admin/crescimento?aba=equipe' })
  return NextResponse.json({ ok: true })
}
