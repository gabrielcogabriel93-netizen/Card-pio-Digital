import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyEstablishmentOwner } from '@/lib/verifyEstablishmentOwner'
import { buildAuthorizationUrl } from '@/lib/mercadoPago'
import { getBaseUrl } from '@/lib/baseUrl'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'

// Primeiro passo do "Conectar com Mercado Pago": gera um state aleatório
// (proteção CSRF do fluxo OAuth), guarda associado ao estabelecimento com
// validade curta, e redireciona pro Mercado Pago autorizar.
export async function GET(request: NextRequest) {
  const establishmentId = request.nextUrl.searchParams.get('establishment_id') || ''

  if (!(await verifyEstablishmentOwner(establishmentId))) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const state = crypto.randomUUID()

  try {
    const admin = createAdminClient()
    const { error } = await admin.from('mercadopago_oauth_states').insert({
      state,
      establishment_id: establishmentId,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    })
    if (error) throw error

    const redirectUri = `${getBaseUrl()}/api/mercadopago/oauth/callback`
    const authorizationUrl = buildAuthorizationUrl(redirectUri, state)
    return NextResponse.redirect(authorizationUrl)
  } catch (err: any) {
    logError('api:mercadopago:oauth:start', 'erro ao iniciar conexão com Mercado Pago', err)
    return NextResponse.redirect(`${getBaseUrl()}/painel/configuracoes?mp=error`)
  }
}
