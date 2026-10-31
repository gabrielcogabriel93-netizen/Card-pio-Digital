// Erros que não são do Freguês: scripts que o navegador do Instagram e do
// Facebook injetam na página (window._META, IABInnerFrame), extensões do
// navegador, o "Script error." opaco de outros domínios e ruídos
// conhecidos do iOS/Chrome. O cliente não percebe nada, mas antes eles
// entravam como "Crítico" nos logs e disparavam aviso para o dono.

const NOISE_MESSAGES = [
  /_META\b|IABInnerFrame|fbq is not defined|fb_xd_fragment/i, // navegador interno do Instagram/Facebook
  /__gCrWeb|webkit\.messageHandlers/i,                         // Chrome/WebView do iOS
  /instantSearchSDKJSBridgeClearHighlight|zaloJSV2|_AutofillCallbackHandler/i,
  /ResizeObserver loop (limit exceeded|completed with undelivered notifications)/i,
]

const EXTENSION_SOURCE = /(chrome|moz|safari|safari-web)-extension:\/\//i

export function isThirdPartyNoise(input: { message?: string | null; stack?: string | null; filename?: string | null }): boolean {
  const message = input.message || ''
  const where = `${input.filename || ''}\n${input.stack || ''}`
  if (NOISE_MESSAGES.some((re) => re.test(message))) return true
  if (EXTENSION_SOURCE.test(where)) return true
  // Erro de script de outro domínio: o navegador esconde tudo, não há o que fazer.
  if (/^Script error\.?$/i.test(message.trim()) && !input.filename) return true
  return false
}
