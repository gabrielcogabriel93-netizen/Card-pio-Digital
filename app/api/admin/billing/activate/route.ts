import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPlatformAdminUser } from '@/lib/platformAdmin'
import { log, logError } from '@/lib/logger'

export const runtime = 'nodejs'

// Ação única e explícita: liga a cobrança da plataforma e, no mesmo
// golpe, dá 7 dias de prazo pra todo estabelecimento que hoje está sem
// prazo nenhum (o "trial livre" de quem se cadastrou antes da ativação).
// Quem se cadastrar DEPOIS já nasce com prazo sozinho (trigger da
// migration 032) — esta rota só cobre quem já existia.
export async function POST() {
  const adminUser = await getPlatformAdminUser()
  if (!adminUser) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  const admin = createAdminClient()

  try {
    const { data: settings, error: settingsError } = await admin
      .from('platform_settings')
      .select('billing_enabled')
      .eq('id', true)
      .single()
    if (settingsError) throw settingsError

    if (settings.billing_enabled) {
      return NextResponse.json({ error: 'A cobrança já está ativa.' }, { status: 400 })
    }

    const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data: grandfathered, error: grandfatherError } = await admin
      .from('establishments')
      .update({ trial_ends_at: trialEndsAt })
      .eq('subscription_status', 'trial')
      .is('trial_ends_at', null)
      .select('id')
    if (grandfatherError) throw grandfatherError

    const { error: updateSettingsError } = await admin
      .from('platform_settings')
      .update({ billing_enabled: true, billing_enabled_at: new Date().toISOString() })
      .eq('id', true)
    if (updateSettingsError) throw updateSettingsError

    log('api:admin:billing:activate', 'cobrança ativada', {
      admin: adminUser.email,
      estabelecimentosComPrazoNovo: grandfathered?.length ?? 0,
    })

    return NextResponse.json({ ok: true, grandfathered: grandfathered?.length ?? 0, trialEndsAt })
  } catch (err) {
    logError('api:admin:billing:activate', 'erro ao ativar cobrança', err)
    return NextResponse.json({ error: 'Erro ao ativar cobrança' }, { status: 500 })
  }
}
