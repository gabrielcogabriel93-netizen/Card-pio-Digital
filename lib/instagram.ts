/**
 * Normaliza o campo "Instagram" de Configurações (aceita @handle, handle
 * puro ou uma URL já completa) para sempre salvar/exibir como
 * `https://instagram.com/handle` — evita que o link do drawer "Sobre a
 * loja" quebre por causa de "@" sobrando ou domínio faltando.
 * Retorna null para entrada vazia (nenhum Instagram cadastrado).
 */
export function normalizeInstagramInput(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // Já é uma URL (instagram.com ou instagr.am, com ou sem www/https) —
  // extrai só o handle e remonta, pra sempre salvar no mesmo formato.
  const urlMatch = trimmed.match(/instagram\.com\/([^/?#]+)/i) || trimmed.match(/instagr\.am\/([^/?#]+)/i)
  const handle = (urlMatch ? urlMatch[1] : trimmed).replace(/^@/, '').trim()

  if (!handle) return null

  return `https://instagram.com/${handle}`
}
