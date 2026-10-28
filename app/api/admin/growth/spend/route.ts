import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireGrowthAccess } from '@/lib/adminAccess'

export const runtime = 'nodejs'

// Investimento em divulgação por mês e canal (base do CAC).
export async function GET() {
  const access = await requireGrowthAccess()
  if (!access) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  const { data, error } = await createAdminClient().from('growth_marketing_spend').select('*').order('month', { ascending: false }).limit(200)
  if (error) return NextResponse.json({ error: 'Não foi possível carregar.' }, { status: 500 })
  return NextResponse.json({ spend: data })
}

export async function POST(request: NextRequest) {
  const access = await requireGrowthAccess()
  if (!access) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const month = String(body.month || '')
  const amount = Number(String(body.amount ?? '').replace(',', '.'))
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: 'Informe o mês.' }, { status: 400 })
  if (!Number.isFinite(amount) || amount < 0) return NextResponse.json({ error: 'Valor inválido.' }, { status: 400 })
  const channel = String(body.channel || 'geral').trim().toLowerCase().slice(0, 40) || 'geral'
  const { error } = await createAdminClient().from('growth_marketing_spend').insert({
    month: `${month}-01`, channel, amount, note: body.note ? String(body.note).slice(0, 200) : null, created_by: access.email,
  })
  if (error) return NextResponse.json({ error: 'Não foi possível salvar.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const access = await requireGrowthAccess()
  if (!access) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Lançamento não informado.' }, { status: 400 })
  const { error } = await createAdminClient().from('growth_marketing_spend').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Não foi possível excluir.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
