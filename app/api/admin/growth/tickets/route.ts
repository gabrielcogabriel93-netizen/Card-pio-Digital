import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireGrowthAccess } from '@/lib/adminAccess'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'

const STATUSES = ['aberto', 'em_andamento', 'resolvido']

// Chamados de suporte abertos pelos lojistas (painel → Ajuda).
export async function GET() {
  const access = await requireGrowthAccess()
  if (!access) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  const { data, error } = await createAdminClient()
    .from('support_tickets')
    .select('id, subject, message, whatsapp, status, admin_reply, created_at, updated_at, resolved_at, establishments(name, slug)')
    .order('created_at', { ascending: false })
    .limit(300)
  if (error) {
    logError('api:admin:growth:tickets', 'erro ao listar chamados', error)
    return NextResponse.json({ error: 'Não foi possível carregar os chamados.' }, { status: 500 })
  }
  return NextResponse.json({ tickets: data })
}

export async function PATCH(request: NextRequest) {
  const access = await requireGrowthAccess()
  if (!access) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  if (!body.id) return NextResponse.json({ error: 'Chamado não informado.' }, { status: 400 })
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: 'Status inválido.' }, { status: 400 })
    update.status = body.status
    update.resolved_at = body.status === 'resolvido' ? new Date().toISOString() : null
  }
  if (body.admin_reply !== undefined) update.admin_reply = body.admin_reply ? String(body.admin_reply).slice(0, 3000) : null
  const { error } = await createAdminClient().from('support_tickets').update(update).eq('id', body.id)
  if (error) return NextResponse.json({ error: 'Não foi possível salvar.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
