import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOwnerAccess } from '@/lib/adminAccess'
import { addOwnerAlert } from '@/lib/ownerAlerts'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'

// Oferta de entrada (migration 059): teste grátis do site + campanhas com
// link, com quantas lojas e assinantes cada campanha trouxe. Só o dono.
export async function GET() {
  const access = await requireOwnerAccess()
  if (!access) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  const admin = createAdminClient()
  const [settings, campaigns, stores] = await Promise.all([
    admin.from('platform_settings').select('billing_enabled, trial_enabled, trial_days').eq('id', true).single(),
    admin.from('signup_campaigns').select('*').order('created_at', { ascending: false }),
    admin.from('establishments').select('signup_campaign, subscription_status, current_period_end').not('signup_campaign', 'is', null),
  ])
  if (settings.error || campaigns.error) {
    return NextResponse.json({ error: 'Rode a migration 059 no Supabase para configurar a oferta e as campanhas.', needsMigration: true }, { status: 409 })
  }
  const now = Date.now()
  const stats: Record<string, { stores: number; paying: number }> = {}
  for (const s of stores.data || []) {
    const k = s.signup_campaign as string
    stats[k] = stats[k] || { stores: 0, paying: 0 }
    stats[k].stores++
    if (s.subscription_status === 'active' && (!s.current_period_end || new Date(s.current_period_end).getTime() > now)) stats[k].paying++
  }
  return NextResponse.json({
    settings: settings.data,
    campaigns: (campaigns.data || []).map((c) => ({ ...c, stores: stats[c.code]?.stores || 0, paying: stats[c.code]?.paying || 0 })),
  })
}

// Liga/desliga o teste grátis e define o prazo.
export async function PUT(request: NextRequest) {
  const access = await requireOwnerAccess()
  if (!access) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const trialEnabled = body.trial_enabled === true
  const trialDays = Math.floor(Number(body.trial_days))
  if (trialEnabled && (!Number.isFinite(trialDays) || trialDays < 1 || trialDays > 365)) {
    return NextResponse.json({ error: 'Informe um prazo entre 1 e 365 dias.' }, { status: 400 })
  }
  const admin = createAdminClient()
  const { error } = await admin
    .from('platform_settings')
    .update({ trial_enabled: trialEnabled, ...(trialEnabled ? { trial_days: trialDays } : {}) })
    .eq('id', true)
  if (error) {
    logError('api:admin:offer', 'erro ao salvar oferta', error)
    return NextResponse.json({ error: 'Não foi possível salvar. A migration 059 já foi aplicada?' }, { status: 500 })
  }
  await addOwnerAlert(admin, {
    kind: 'admin',
    title: trialEnabled ? `Teste grátis LIGADO: ${trialDays} dias` : 'Teste grátis DESLIGADO (cobra desde o cadastro)',
    body: `Por ${access.email}. Vale para novos cadastros sem campanha.`,
    url: '/admin',
  })
  return NextResponse.json({ ok: true })
}
