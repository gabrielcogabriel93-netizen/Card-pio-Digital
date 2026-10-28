import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireGrowthAccess } from '@/lib/adminAccess'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'

const KINDS = ['whatsapp', 'ligacao', 'email', 'nota']

// Histórico de contato com o lojista.
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireGrowthAccess()
  if (!access) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  const { data, error } = await createAdminClient()
    .from('growth_lead_notes')
    .select('id, author_email, kind, body, created_at')
    .eq('lead_id', params.id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Não foi possível carregar o histórico.' }, { status: 500 })
  return NextResponse.json({ notes: data })
}

// Registra um contato. Contato feito tira o "novo" e marca a data.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireGrowthAccess()
  if (!access) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const text = String(body.body || '').trim()
  const kind = KINDS.includes(body.kind) ? body.kind : 'nota'
  if (!text) return NextResponse.json({ error: 'Escreva o que aconteceu no contato.' }, { status: 400 })

  const admin = createAdminClient()
  try {
    const { error } = await admin.from('growth_lead_notes').insert({ lead_id: params.id, author_email: access.email, kind, body: text.slice(0, 2000) })
    if (error) throw error
    if (kind !== 'nota') {
      const { data: lead } = await admin.from('growth_leads').select('crm_status').eq('id', params.id).single()
      await admin.from('growth_leads').update({
        last_contact_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...(lead?.crm_status === 'novo' ? { crm_status: 'contatado' } : {}),
      }).eq('id', params.id)
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    logError('api:admin:growth:notes', 'erro ao registrar contato', err)
    return NextResponse.json({ error: 'Não foi possível salvar.' }, { status: 500 })
  }
}
