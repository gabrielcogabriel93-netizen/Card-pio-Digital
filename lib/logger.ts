/**
 * Logger do app. Além do console, TODO erro vai para a tabela error_logs,
 * que aparece em /admin/logs (painel do dono da plataforma):
 *
 * - no servidor (rotas de API, webhooks, cron): gravado com a service role;
 * - no navegador (cardápio, painel): gravado com a chave pública, com
 *   limite por IP no banco (migration 045) para ninguém encher a tabela.
 *
 * Nunca lança erro por conta própria (best-effort): uma falha ao registrar
 * o log não pode derrubar o fluxo que já estava com problema.
 */

export type LogLevel = 'error' | 'critical' | 'warning'

function timestamp() {
  return new Date().toISOString().split('T')[1].replace('Z', '')
}

export function log(scope: string, message: string, data?: unknown) {
  if (process.env.NODE_ENV === 'production') return
  if (data !== undefined) console.log(`[${timestamp()}] [${scope}] ${message}`, data)
  else console.log(`[${timestamp()}] [${scope}] ${message}`)
}

function serializeDetail(detail: unknown): unknown {
  if (detail instanceof Error) {
    return { name: detail.name, message: detail.message, stack: detail.stack?.split('\n').slice(0, 12).join('\n') }
  }
  if (detail && typeof detail === 'object' && 'message' in (detail as any)) {
    // Erros do Supabase/PostgREST chegam como objeto { message, code, details, hint }.
    const d = detail as Record<string, unknown>
    return { message: d.message, code: d.code, details: d.details, hint: d.hint, status: d.status }
  }
  try {
    return JSON.parse(JSON.stringify(detail ?? null))
  } catch {
    return { raw: String(detail) }
  }
}

function describe(detail: unknown): string {
  if (!detail) return ''
  if (detail instanceof Error) return detail.message
  if (typeof detail === 'object' && 'message' in (detail as any)) return String((detail as any).message)
  if (typeof detail === 'string') return detail
  return ''
}

// Não registra o mesmo erro (escopo + mensagem) mais de uma vez por minuto
// no mesmo processo/aba: um loop de erro não vira milhares de linhas.
const recent = new Map<string, number>()
function shouldReport(key: string): boolean {
  const now = Date.now()
  const last = recent.get(key)
  if (last && now - last < 60_000) return false
  recent.set(key, now)
  if (recent.size > 200) {
    const oldest = recent.keys().next().value
    if (oldest) recent.delete(oldest)
  }
  return true
}

// Erros esperados de uso (loja fechada, estoque, cupom) não são falhas do
// sistema e não precisam poluir a aba de logs.
const EXPECTED = /Muitas consultas|Muitos pedidos|fechada agora|esgotad|Estoque insuficiente|Cupom (inválido|não encontrado|expirado|esgotado|inativo)|Você já usou|Confirme seu telefone|Código (incorreto|expirado)|Informe |Escolha |pedido mínimo|Invalid login credentials|Email not confirmed|User already registered|Password should be|For security purposes, you can only request/i

async function persist(level: LogLevel, scope: string, message: string, detail: unknown, establishmentId?: string | null) {
  const full = [message, describe(detail)].filter(Boolean).join(': ').slice(0, 1000)
  if (EXPECTED.test(full)) return
  if (!shouldReport(`${level}|${scope}|${full}`)) return

  const row = {
    establishment_id: establishmentId || null,
    scope: scope.slice(0, 120),
    message: full,
    detail: serializeDetail(detail),
    level,
    source: typeof window === 'undefined' ? 'servidor' : 'navegador',
    url: typeof window !== 'undefined' ? window.location.href : null,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent?.slice(0, 300) : null,
  }

  try {
    if (typeof window === 'undefined') {
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return
      const { createAdminClient } = await import('@/lib/supabase/admin')
      await createAdminClient().from('error_logs').insert(row)
    } else {
      const { createClient } = await import('@/lib/supabase/client')
      await createClient().from('error_logs').insert(row)
    }
  } catch {
    // best-effort
  }
}

/** Erro comum: console + aba de logs do admin. */
export function logError(scope: string, message: string, error: unknown, establishmentId?: string | null) {
  console.error(`[${timestamp()}] [${scope}] ${message}`, error)
  void persist('error', scope, message, error, establishmentId)
}

/** Aviso (algo estranho, mas o fluxo seguiu). */
export function logWarning(scope: string, message: string, detail?: unknown, establishmentId?: string | null) {
  console.warn(`[${timestamp()}] [${scope}] ${message}`, detail ?? '')
  void persist('warning', scope, message, detail, establishmentId)
}

/**
 * Falha que realmente importa (pedido não enviado, venda não fechou, tela
 * quebrou). Mesmo destino, com nível "crítico" para aparecer em destaque.
 */
export async function logCritical(scope: string, message: string, detail?: unknown, establishmentId?: string) {
  console.error(`[${timestamp()}] [CRÍTICO] [${scope}] ${message}`, detail)
  await persist('critical', scope, message, detail, establishmentId)
}
