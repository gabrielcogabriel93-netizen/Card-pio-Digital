import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { exchangeCodeForToken, getUserInfo } from '@/lib/mercadoPago'
import { getBaseUrl } from '@/lib/baseUrl'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'

// O Mercado Pago chama essa rota de volta depois do lojista autorizar (ou
// negar) a conexão — sem sessão nenhuma, só o `state` gerado em
// /oauth/start garante que isso pertence ao estabelecimento certo.
export async function GET(request: NextRequest) {
  const settingsUrl = `${getBaseUrl()}/painel/configuracoes`
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const oauthError = request.nextUrl.searchParams.get('error')

  if (oauthError) {
    return NextResponse.redirect(`${settingsUrl}?mp=denied`)
  }
  if (!code || !state) {
    return NextResponse.redirect(`${settingsUrl}?mp=error`)
  }

  const admin = createAdminClient()

  try {
    const { data: stateRow, error: stateError } = await admin
      .from('mercadopago_oauth_states')
      .select('establishment_id, expires_at')
      .eq('state', state)
      .maybeSingle()

    // Um-só-uso: apaga assim que lido, venha a validação a dar certo ou não.
    await admin.from('mercadopago_oauth_states').delete().eq('state', state)

    if (stateError || !stateRow || new Date(stateRow.expires_at).getTime() < Date.now()) {
      return NextResponse.redirect(`${settingsUrl}?mp=error`)
    }

    const redirectUri = `${getBaseUrl()}/api/mercadopago/oauth/callback`
    const tokenResponse = await exchangeCodeForToken(code, redirectUri)
    const { email } = await getUserInfo(tokenResponse.access_token)

    const { error: upsertError } = await admin
      .from('mercadopago_accounts')
      .upsert(
        {
          establishment_id: stateRow.establishment_id,
          mp_user_id: String(tokenResponse.user_id),
          access_token: tokenResponse.access_token,
          refresh_token: tokenResponse.refresh_token,
          public_key: tokenResponse.public_key || null,
          email,
          expires_at: new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString(),
          is_active: true,
        },
        { onConflict: 'establishment_id' }
      )
    if (upsertError) throw upsertError

    return NextResponse.redirect(`${settingsUrl}?mp=connected`)
  } catch (err) {
    logError('api:mercadopago:oauth:callback', 'erro ao concluir conexão com Mercado Pago', err)
    return NextResponse.redirect(`${settingsUrl}?mp=error`)
  }
}
