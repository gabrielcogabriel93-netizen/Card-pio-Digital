import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireGrowthAccess } from '@/lib/adminAccess'
import { loadLeadRows } from '@/lib/growthData'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'
export const maxDuration = 60

const STATUSES = ['novo', 'contatado', 'sem_resposta', 'interessado', 'convertido', 'perdido']

// Lista de contatos (todo mundo que começou o cadastro e toda loja).
export async function GET() {
  const access = await requireGrowthAccess()
  if (!access) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  try {
    const admin = createAdminClient()
    const { rows } = await loadLeadRows(admin)
    const { data: notes } = await admin.from('growth_lead_notes').select('lead_id, body, created_at').order('created_at', { ascending: false }).limit(2000)
    const lastNote = new Map<string, { body: string; created_at: string }>()
    for (const n of notes || []) if (!lastNote.has(n.lead_id)) lastNote.set(n.lead_id, n)
    const leads = rows.map((r) => ({
      id: r.id,
      created_at: r.created_at,
      name: r.name,
      email: r.email,
      whatsapp: r.whatsapp,
      store_name: r.store?.name || r.store_name,
      store_id: r.store?.id || null,
      store_created_at: r.store?.created_at || null,
      plan_tier: r.store?.plan_tier || null,
      stage: r.stage,
      flags: r.flags,
      source: r.source,
      utm_campaign: r.utm_campaign || null,
      crm_status: r.crm_status,
      assigned_to: r.assigned_to,
      next_follow_up: r.next_follow_up,
      last_contact_at: r.last_contact_at,
      trial_days_left: r.trialDaysLeft,
      products: r.stats?.products_count ?? null,
      orders_total: r.stats?.orders_total ?? null,
      orders_30d: r.stats?.orders_30d ?? null,
      sales_30d: r.stats?.sales_30d ?? null,
      last_activity_day: r.stats?.last_activity_day ?? null,
      push_devices: r.stats?.push_devices ?? null,
      last_note: lastNote.get(r.id) || null,
    }))
    return NextResponse.json({ leads, me: access.email, role: access.role })
  } catch (err) {
    logError('api:admin:growth:leads', 'erro ao listar contatos', err)
    return NextResponse.json({ error: 'Não foi possível carregar os contatos.' }, { status: 500 })
  }
}

// Atualiza status, responsável, próximo contato e motivo de perda.
export async function PATCH(request: NextRequest) {
  const access = await requireGrowthAccess()
  if (!access) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  if (!body.id) return NextResponse.json({ error: 'Contato não informado.' }, { status: 400 })

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.crm_status !== undefined) {
    if (!STATUSES.includes(body.crm_status)) return NextResponse.json({ error: 'Status inválido.' }, { status: 400 })
    update.crm_status = body.crm_status
  }
  if (body.assigned_to !== undefined) update.assigned_to = body.assigned_to ? String(body.assigned_to).slice(0, 120) : null
  if (body.next_follow_up !== undefined) {
    if (body.next_follow_up && !/^\d{4}-\d{2}-\d{2}$/.test(body.next_follow_up)) return NextResponse.json({ error: 'Data inválida.' }, { status: 400 })
    update.next_follow_up = body.next_follow_up || null
  }
  if (body.lost_reason !== undefined) update.lost_reason = body.lost_reason ? String(body.lost_reason).slice(0, 300) : null

  const { error } = await createAdminClient().from('growth_leads').update(update).eq('id', body.id)
  if (error) {
    logError('api:admin:growth:leads', 'erro ao atualizar contato', error)
    return NextResponse.json({ error: 'Não foi possível salvar.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
