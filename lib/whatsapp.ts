// WhatsApp dos lojistas (cadastro, contatos da equipe de crescimento).
// Guardado só com dígitos e com o 55 do Brasil, igual normalize_whatsapp
// no banco (migration 057), para o link wa.me abrir a conversa certa.

export function normalizeWhatsapp(value: string | null | undefined): string | null {
  const d = (value || '').replace(/\D/g, '')
  if (!d) return null
  return d.length === 10 || d.length === 11 ? `55${d}` : d
}

/** Número com DDD válido para o cadastro: 10 ou 11 dígitos (celular começa com 9). */
export function isValidBrazilWhatsapp(value: string): boolean {
  const d = value.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
  if (d.length === 11) return d[2] === '9' && Number(d.slice(0, 2)) >= 11
  if (d.length === 10) return Number(d.slice(0, 2)) >= 11
  return false
}

/** +55 (11) 99999-8888 */
export function formatWhatsapp(digits: string | null | undefined): string {
  const d = (digits || '').replace(/\D/g, '')
  const local = d.startsWith('55') && (d.length === 12 || d.length === 13) ? d.slice(2) : d
  if (local.length === 11) return `+55 (${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
  if (local.length === 10) return `+55 (${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`
  return d ? `+${d}` : ''
}

export function whatsappLink(digits: string | null | undefined, text?: string): string | null {
  const n = normalizeWhatsapp(digits)
  if (!n) return null
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}
