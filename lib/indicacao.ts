import { log, logError } from '@/lib/logger'

// Lido pelo middleware.ts quando o link do divulgador (/cadastro?ref=CODIGO)
// é acessado -- ver migrations/034_divulgadores_stripe.sql.
const REF_COOKIE_NAME = 'divulgador_ref'

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

/**
 * Chamada logo depois que um estabelecimento é criado (app/cadastro e
 * app/completar-cadastro) -- se existir um cookie de indicação, vincula
 * via /api/indicacao/vincular. Best-effort: nunca lança erro nem trava o
 * fluxo de cadastro da loja por causa disso, só loga.
 */
export async function vincularIndicacaoSeHouver(): Promise<void> {
  const codigoAfiliado = readCookie(REF_COOKIE_NAME)
  if (!codigoAfiliado) return

  try {
    const response = await fetch('/api/indicacao/vincular', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigoAfiliado }),
    })
    const data = await response.json().catch(() => ({}))
    log('indicacao', 'tentativa de vínculo de indicação', { codigoAfiliado, linked: data?.linked })
  } catch (err) {
    logError('indicacao', 'erro ao vincular indicação (não bloqueia o cadastro)', err)
  }
}
