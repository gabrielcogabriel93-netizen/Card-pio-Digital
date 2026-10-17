import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPlatformAdminUser } from '@/lib/platformAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Aba Logs do admin: todos os erros registrados por lib/logger.ts
// (servidor e navegador), de todas as lojas. Só o dono da plataforma.
export async function GET(request: NextRequest) {
  const adminUser = await getPlatformAdminUser()
  if (!adminUser) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const params = request.nextUrl.searchParams
  const level = params.get('level')
  const source = params.get('source')
  const search = (params.get('q') || '').trim()
  const hours = Math.min(Math.max(Number(params.get('hours')) || 24, 1), 24 * 30)
  const showResolved = params.get('resolved') === '1'
  const since = new Date(Date.now() - hours * 3600_000).toISOString()

  const admin = createAdminClient()
  let query = admin
    .from('error_logs')
    .select('id, created_at, level, source, scope, message, detail, url, user_agent, resolved_at, establishment_id, establishments(name, slug)')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(300)

  if (level) query = query.eq('level', level)
  if (source) query = query.eq('source', source)
  if (!showResolved) query = query.is('resolved_at', null)
  if (search) query = query.or(`message.ilike.%${search.replace(/[%,()]/g, ' ')}%,scope.ilike.%${search.replace(/[%,()]/g, ' ')}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Resumo para os cartões do topo (mesma janela de tempo, sem filtros).
  const { data: summaryRows } = await admin
    .from('error_logs')
    .select('level')
    .gte('created_at', since)
    .is('resolved_at', null)
    .limit(5000)
  const summary = { critical: 0, error: 0, warning: 0 }
  for (const row of summaryRows || []) {
    const key = (row.level || 'error') as keyof typeof summary
    if (key in summary) summary[key]++
  }

  return NextResponse.json({ logs: data || [], summary })
}

// Marcar como resolvido (um, ou todos de um escopo).
export async function PATCH(request: NextRequest) {
  const adminUser = await getPlatformAdminUser()
  if (!adminUser) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const admin = createAdminClient()
  const now = new Date().toISOString()

  if (body?.id) {
    const { error } = await admin.from('error_logs').update({ resolved_at: now }).eq('id', body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (body?.scope) {
    const { error } = await admin.from('error_logs').update({ resolved_at: now }).eq('scope', body.scope).is('resolved_at', null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    return NextResponse.json({ error: 'Informe id ou scope' }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
