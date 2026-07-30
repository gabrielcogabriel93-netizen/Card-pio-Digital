import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyEstablishmentOwner } from '@/lib/verifyEstablishmentOwner'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'

// Único jeito da tela de Configurações sabe se o Mercado Pago está
// conectado — nunca lê `mercadopago_accounts` direto (RLS bloqueia geral,
// só a service role passa, e é assim de propósito).
export async function GET(request: NextRequest) {
  const establishmentId = request.nextUrl.searchParams.get('establishment_id') || ''

  if (!(await verifyEstablishmentOwner(establishmentId))) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const [{ data: account }, { data: establishment }] = await Promise.all([
      admin
        .from('mercadopago_accounts')
        .select('email')
        .eq('establishment_id', establishmentId)
        .eq('is_active', true)
        .maybeSingle(),
      admin.from('establishments').select('billing_mode').eq('id', establishmentId).single(),
    ])

    return NextResponse.json({
      connected: !!account,
      email: account?.email || null,
      billingMode: establishment?.billing_mode || 'comissao',
    })
  } catch (err) {
    logError('api:mercadopago:status', 'erro ao consultar status da conexão', err)
    return NextResponse.json({ error: 'Erro ao consultar status' }, { status: 500 })
  }
}
