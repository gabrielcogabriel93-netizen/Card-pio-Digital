import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPlatformAdminUser } from '@/lib/platformAdmin'
import { log, logError } from '@/lib/logger'

export const runtime = 'nodejs'

// Desliga de novo — ninguém fica bloqueado enquanto isso estiver
// desativado, não importa o que esteja salvo em trial_ends_at/
// current_period_end de cada estabelecimento (get_my_subscription_status
// já ignora essas colunas quando billing_enabled = false).
export async function POST() {
  const adminUser = await getPlatformAdminUser()
  if (!adminUser) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  const admin = createAdminClient()

  try {
    const { error } = await admin
      .from('platform_settings')
      .update({ billing_enabled: false })
      .eq('id', true)
    if (error) throw error

    log('api:admin:billing:deactivate', 'cobrança desativada', { admin: adminUser.email })
    return NextResponse.json({ ok: true })
  } catch (err) {
    logError('api:admin:billing:deactivate', 'erro ao desativar cobrança', err)
    return NextResponse.json({ error: 'Erro ao desativar cobrança' }, { status: 500 })
  }
}
