import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOwnerAccess } from '@/lib/adminAccess'

export const runtime = 'nodejs'

// Avisos do dono (lista no admin). Só o dono vê.
export async function GET() {
  const access = await requireOwnerAccess()
  if (!access) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  const admin = createAdminClient()
  const [{ data: alerts }, { count: unread }, { data: devices }] = await Promise.all([
    admin.from('owner_alerts').select('id, kind, title, body, url, created_at, read_at').order('created_at', { ascending: false }).limit(100),
    admin.from('owner_alerts').select('id', { count: 'exact', head: true }).is('read_at', null),
    admin.from('owner_push_subscriptions').select('endpoint, created_at, last_ok_at').eq('user_email', access.email),
  ])
  return NextResponse.json({ alerts: alerts || [], unread: unread || 0, devices: (devices || []).length })
}

// Marca como lidos (todos ou um).
export async function PATCH(request: NextRequest) {
  const access = await requireOwnerAccess()
  if (!access) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  let query = createAdminClient().from('owner_alerts').update({ read_at: new Date().toISOString() }).is('read_at', null)
  if (body.id) query = query.eq('id', body.id)
  const { error } = await query
  if (error) return NextResponse.json({ error: 'Não foi possível atualizar.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
