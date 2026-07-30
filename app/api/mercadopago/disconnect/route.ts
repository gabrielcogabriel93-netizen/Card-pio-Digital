import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyEstablishmentOwner } from '@/lib/verifyEstablishmentOwner'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'

interface DisconnectBody {
  establishment_id: string
}

// Desconecta localmente (a Pix automática some do checkout na hora).
// O Mercado Pago não documenta um endpoint de revogação programática do
// token do vendedor — se o lojista quiser cortar o acesso por completo do
// lado do MP também, ele consegue em "Minha conta > Aplicativos
// conectados" no próprio Mercado Pago.
export async function POST(request: NextRequest) {
  let body: DisconnectBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (!body.establishment_id || !(await verifyEstablishmentOwner(body.establishment_id))) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from('mercadopago_accounts')
      .update({ is_active: false })
      .eq('establishment_id', body.establishment_id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err) {
    logError('api:mercadopago:disconnect', 'erro ao desconectar Mercado Pago', err)
    return NextResponse.json({ error: 'Erro ao desconectar' }, { status: 500 })
  }
}
