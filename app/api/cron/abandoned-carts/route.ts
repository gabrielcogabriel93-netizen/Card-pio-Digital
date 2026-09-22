import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { log, logError } from '@/lib/logger'
import { safeCompareSecret } from '@/lib/safeCompare'

export const runtime = 'nodejs'

// Chamada por pg_cron (agendamento opcional, ver migration 042) a cada
// alguns minutos -- mesmo padrão de autenticação de
// app/api/cron/advance-orders. Não manda WhatsApp nenhum (não existe
// isso hoje sem clique de alguém, ver comentário na migration 042) --
// só marca reminder_flagged_at nos rascunhos de carrinho parados há
// mais tempo que o configurado, pra virar log/estatística. A lista de
// "carrinhos abandonados" em /painel/whatsapp já calcula isso na hora,
// sem depender deste cron -- ele existe só pra manter o registro
// histórico mesmo se ninguém abrir o painel.
export async function POST(request: NextRequest) {
  const secretHeader = request.headers.get('x-cron-secret')
  if (!safeCompareSecret(secretHeader, process.env.CRON_TRIGGER_SECRET)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const admin = createAdminClient()

  await admin
    .from('cron_health')
    .upsert({ job_name: 'flag-abandoned-carts', last_run_at: new Date().toISOString() }, { onConflict: 'job_name' })

  try {
    const { data: establishments, error: estError } = await admin
      .from('establishments')
      .select('id, abandoned_cart_minutes')

    if (estError) throw estError
    if (!establishments || establishments.length === 0) {
      return NextResponse.json({ flagged: 0 })
    }

    let flagged = 0
    for (const establishment of establishments) {
      const minutes = establishment.abandoned_cart_minutes ?? 15
      const threshold = new Date(Date.now() - minutes * 60_000).toISOString()

      const { data: updated, error: updateError } = await admin
        .from('cart_drafts')
        .update({ reminder_flagged_at: new Date().toISOString() })
        .eq('establishment_id', establishment.id)
        .is('recovered_at', null)
        .is('reminder_flagged_at', null)
        .lt('updated_at', threshold)
        .select('id')

      if (updateError) {
        logError('cron:abandoned-carts', 'erro ao marcar carrinhos abandonados', updateError)
        continue
      }
      flagged += updated?.length ?? 0
    }

    log('cron:abandoned-carts', 'execução concluída', { flagged })
    return NextResponse.json({ flagged })
  } catch (err) {
    logError('cron:abandoned-carts', 'erro ao processar carrinhos abandonados', err)
    return NextResponse.json({ error: 'Erro ao processar carrinhos abandonados' }, { status: 500 })
  }
}
