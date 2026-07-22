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

function serializeDetail(detail: unknown) {
  if (detail instanceof Error) {
    return { name: detail.name, message: detail.message, stack: detail.stack }
  }
  try {
    return JSON.parse(JSON.stringify(detail))
  } catch {
    return { raw: String(detail) }
  }
}

/**
 * Para falhas que realmente importam (pedido não foi enviado, venda não
 * fechou, tela quebrou) — além do console, grava em error_logs para o
 * lojista/desenvolvedor conseguir ver depois, mesmo sem ter visto o erro
 * acontecer ao vivo. Nunca lança erro por conta própria (best-effort).
 */
export async function logCritical(
  scope: string,
  message: string,
  detail?: unknown,
  establishmentId?: string
) {
  console.error(`[${timestamp()}] [CRÍTICO] [${scope}] ${message}`, detail)
  try {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.from('error_logs').insert({
      establishment_id: establishmentId || null,
      scope,
      message,
      detail: serializeDetail(detail),
      url: typeof window !== 'undefined' ? window.location.href : null,
    })
  } catch {
    // Best-effort: se nem isso funcionar, ao menos o console.error acima já rodou.
  }
}
