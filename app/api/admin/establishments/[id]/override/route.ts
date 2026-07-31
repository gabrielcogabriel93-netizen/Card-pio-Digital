import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPlatformAdminUser } from '@/lib/platformAdmin'
import { log, logError } from '@/lib/logger'

export const runtime = 'nodejs'

interface OverrideBody {
  // 'exempt' isenta de cobrança pra sempre (cortesia); 'restore' volta ao
  // fluxo normal de trial/assinatura; 'set_trial_ends_at' ajusta o prazo
  // manualmente — útil tanto pro suporte quanto pra testar o bloqueio sem
  // esperar 7 dias de verdade.
  action: 'exempt' | 'restore' | 'set_trial_ends_at'
  trialEndsAt?: string
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const adminUser = await getPlatformAdminUser()
  if (!adminUser) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  let body: OverrideBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const admin = createAdminClient()

  try {
    if (body.action === 'exempt') {
      const { error } = await admin.from('establishments').update({ subscription_status: 'exempt' }).eq('id', params.id)
      if (error) throw error
    } else if (body.action === 'restore') {
      const { error } = await admin.from('establishments').update({ subscription_status: 'trial' }).eq('id', params.id)
      if (error) throw error
    } else if (body.action === 'set_trial_ends_at') {
      if (!body.trialEndsAt) {
        return NextResponse.json({ error: 'trialEndsAt é obrigatório' }, { status: 400 })
      }
      const { error } = await admin.from('establishments').update({ trial_ends_at: body.trialEndsAt }).eq('id', params.id)
      if (error) throw error
    } else {
      return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 })
    }

    log('api:admin:establishments:override', 'override aplicado', { admin: adminUser.email, establishmentId: params.id, action: body.action })
    return NextResponse.json({ ok: true })
  } catch (err) {
    logError('api:admin:establishments:override', 'erro ao aplicar override', err)
    return NextResponse.json({ error: 'Erro ao aplicar alteração' }, { status: 500 })
  }
}
