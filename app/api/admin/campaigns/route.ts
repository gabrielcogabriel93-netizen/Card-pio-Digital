import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOwnerAccess } from '@/lib/adminAccess'
import { addOwnerAlert } from '@/lib/ownerAlerts'
import { normalizeCampaignCode } from '@/lib/offer'

export const runtime = 'nodejs'

// Campanhas com link próprio (/p/codigo): parceiros, Black Friday etc.

function readCampaign(body: any, partial = false) {
  const out: Record<string, unknown> = {}
  const int = (v: unknown, min: number, max: number, label: string) => {
    const n = Math.floor(Number(v))
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${label}: use um número entre ${min} e ${max}.`)
    return n
  }
  if (!partial || body.name !== undefined) {
    const name = String(body.name || '').trim()
    if (!name) throw new Error('Dê um nome para a campanha.')
    out.name = name.slice(0, 80)
  }
  if (!partial || body.trial_days !== undefined) out.trial_days = int(body.trial_days ?? 0, 0, 365, 'Dias grátis')
  if (!partial || body.discount_percent !== undefined) out.discount_percent = int(body.discount_percent ?? 0, 0, 90, 'Desconto')
  if (!partial || body.discount_months !== undefined) out.discount_months = int(body.discount_months ?? 0, 0, 24, 'Meses de desconto')
  if (out.discount_percent && !out.discount_months && !partial) throw new Error('Informe por quantos meses vale o desconto.')
  for (const k of ['starts_at', 'ends_at'] as const) {
    if (!partial || body[k] !== undefined) {
      if (body[k] && Number.isNaN(new Date(body[k]).getTime())) throw new Error('Data inválida.')
      out[k] = body[k] ? new Date(body[k]).toISOString() : null
    }
  }
  if (out.starts_at && out.ends_at && new Date(out.ends_at as string) <= new Date(out.starts_at as string)) throw new Error('O fim precisa ser depois do início.')
  if (body.is_active !== undefined) out.is_active = body.is_active === true
  if (body.note !== undefined) out.note = body.note ? String(body.note).slice(0, 300) : null
  return out
}

export async function POST(request: NextRequest) {
  const access = await requireOwnerAccess()
  if (!access) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const code = normalizeCampaignCode(body.code)
  if (!code) return NextResponse.json({ error: 'Código do link: 2 a 40 letras minúsculas, números ou hífen (ex.: parceria-joao).' }, { status: 400 })
  let data
  try {
    data = readCampaign(body)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
  const admin = createAdminClient()
  const { error } = await admin.from('signup_campaigns').insert({ code, ...data })
  if (error) {
    return NextResponse.json({ error: error.code === '23505' ? 'Já existe uma campanha com esse código.' : 'Não foi possível criar. A migration 059 já foi aplicada?' }, { status: 400 })
  }
  await addOwnerAlert(admin, { kind: 'admin', title: `Campanha criada: ${data.name}`, body: `Link /p/${code} · por ${access.email}`, url: '/admin' })
  return NextResponse.json({ ok: true })
}

export async function PATCH(request: NextRequest) {
  const access = await requireOwnerAccess()
  if (!access) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const code = normalizeCampaignCode(body.code)
  if (!code) return NextResponse.json({ error: 'Campanha não informada.' }, { status: 400 })
  let data
  try {
    data = readCampaign(body, true)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
  const admin = createAdminClient()
  const { error } = await admin.from('signup_campaigns').update({ ...data, updated_at: new Date().toISOString() }).eq('code', code)
  if (error) return NextResponse.json({ error: 'Não foi possível salvar.' }, { status: 500 })
  await addOwnerAlert(admin, { kind: 'admin', title: `Campanha alterada: ${code}`, body: `Por ${access.email}`, url: '/admin' })
  return NextResponse.json({ ok: true })
}

// Excluir só sem lojas; com lojas, desative (elas guardam a campanha de origem).
export async function DELETE(request: NextRequest) {
  const access = await requireOwnerAccess()
  if (!access) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  const code = normalizeCampaignCode(request.nextUrl.searchParams.get('code'))
  if (!code) return NextResponse.json({ error: 'Campanha não informada.' }, { status: 400 })
  const admin = createAdminClient()
  const { count } = await admin.from('establishments').select('id', { count: 'exact', head: true }).eq('signup_campaign', code)
  if ((count || 0) > 0) return NextResponse.json({ error: 'Essa campanha já trouxe lojas. Desative em vez de excluir, para manter o histórico e o desconto delas.' }, { status: 400 })
  const { error } = await admin.from('signup_campaigns').delete().eq('code', code)
  if (error) return NextResponse.json({ error: 'Não foi possível excluir.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
