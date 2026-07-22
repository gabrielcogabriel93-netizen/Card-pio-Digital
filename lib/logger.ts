/**
 * Logger simples para acompanhar cada etapa dos fluxos (auth, painel,
 * cardápio público) no console do navegador durante o desenvolvimento.
 * Facilita achar em qual passo exato algo travou ou falhou.
 */

function timestamp() {
  return new Date().toISOString().split('T')[1].replace('Z', '')
}

export function log(scope: string, message: string, data?: unknown) {
  if (data !== undefined) {
    console.log(`[${timestamp()}] [${scope}] ${message}`, data)
  } else {
    console.log(`[${timestamp()}] [${scope}] ${message}`)
  }
}

export function logError(scope: string, message: string, error: unknown) {
  console.error(`[${timestamp()}] [${scope}] ${message}`, error)
}
