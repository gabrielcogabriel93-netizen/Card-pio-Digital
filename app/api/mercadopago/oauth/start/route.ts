import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyEstablishmentOwner } from '@/lib/verifyEstablishmentOwner'
import { buildAuthorizationUrl } from '@/lib/mercadoPago'
import { getBaseUrl } from '@/lib/baseUrl'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'

// Pacote oficial do app "Mercado Pago: cuenta digital" na Play Store — usado
// no intent:// abaixo pra abrir o app direto no Android quando instalado.
const MP_ANDROID_PACKAGE = 'com.mercadopago.wallet'

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Página-ponte: em vez de mandar um redirect HTTP 302 direto pro Mercado
// Pago, serve um HTML que redireciona via JavaScript. Isso importa porque o
// iOS ignora Universal Links (abrir o app em vez do Safari) quando o destino
// é alcançado por uma cadeia de redirect HTTP entre domínios — mas uma
// navegação disparada por `window.location` já conta como "de verdade" pro
// sistema, então o app do Mercado Pago abre normalmente se estiver
// instalado. No Android, tenta abrir o app direto pelo pacote oficial via
// intent://, caindo pro navegador (com a mesma URL de autorização) se o app
// não estiver instalado ou o navegador não suportar intent://.
function buildRedirectPage(authorizationUrl: string): string {
  const safeUrl = escapeHtml(authorizationUrl)
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Conectando ao Mercado Pago…</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; background: #f9fafb; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; color: #111827; }
  .box { text-align: center; padding: 24px; }
  .spinner { width: 32px; height: 32px; border: 3px solid #e5e7eb; border-top-color: #009ee3; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  a { color: #009ee3; }
</style>
</head>
<body>
<div class="box">
  <div class="spinner"></div>
  <p>Redirecionando para o Mercado Pago…</p>
  <p><a id="fallback" href="${safeUrl}">Toque aqui se não for redirecionado automaticamente</a></p>
</div>
<script>
(function () {
  var authUrl = ${JSON.stringify(authorizationUrl)};
  var fallbackLink = document.getElementById('fallback');
  if (fallbackLink) fallbackLink.href = authUrl;

  var isAndroid = /Android/i.test(navigator.userAgent || '');
  var target = authUrl;

  if (isAndroid) {
    var withoutScheme = authUrl.replace(/^https?:\\/\\//, '');
    target = 'intent://' + withoutScheme +
      '#Intent;scheme=https;package=${MP_ANDROID_PACKAGE};S.browser_fallback_url=' +
      encodeURIComponent(authUrl) + ';end';
  }

  var navigatedAway = false;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) navigatedAway = true;
  });

  window.location.replace(target);

  // Se depois de um tempo a página ainda estiver visível (intent:// não
  // suportado nesse navegador, por exemplo), cai pra URL normal no browser.
  setTimeout(function () {
    if (!navigatedAway) window.location.href = authUrl;
  }, 1500);
})();
</script>
</body>
</html>`
}

// Primeiro passo do "Conectar com Mercado Pago": gera um state aleatório
// (proteção CSRF do fluxo OAuth), guarda associado ao estabelecimento com
// validade curta, e manda pro Mercado Pago autorizar — abrindo direto no
// app do Mercado Pago quando o lojista tiver ele instalado no celular.
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
    return new NextResponse(buildRedirectPage(authorizationUrl), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (err: any) {
    logError('api:mercadopago:oauth:start', 'erro ao iniciar conexão com Mercado Pago', err)
    return NextResponse.redirect(`${getBaseUrl()}/painel/configuracoes?mp=error`)
  }
}
