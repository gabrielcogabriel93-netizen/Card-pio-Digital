import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOwnerStore } from '@/lib/ownerStore'
import { maybeSendOpenPush, OPEN_PUSH_COLUMNS, type OpenPushStoreRow } from '@/lib/openPush'

export const runtime = 'nodejs'

// Chamado pelo painel quando o lojista abre a loja ou entra no painel:
// se for o momento da abertura e o aviso estiver ligado, manda (uma vez
// por dia). Funciona mesmo se o agendador estiver parado.
export async function POST() {
  const store = await getOwnerStore<OpenPushStoreRow>(OPEN_PUSH_COLUMNS)
  if (!store) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const result = await maybeSendOpenPush(createAdminClient(), store)
  return NextResponse.json(result)
}
