/** Formata enquanto digita: (11) 99999-8888 ou (11) 9999-8888. */
export function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)

  if (digits.length === 0) return ''
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

/**
 * Normaliza um número de telefone brasileiro para o formato que o link
 * do WhatsApp (wa.me) espera: código do país + DDD + número, só dígitos.
 * Se o lojista esqueceu de incluir o "55" no WhatsApp da loja, o link
 * abriria a conversa errada — isso corrige na hora de montar o link.
 */
export function toWhatsAppNumber(value: string): string {
  const digits = value.replace(/\D/g, '')

  // Já parece ter o código do país (55 + DDD + número = 12 ou 13 dígitos)
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits
  }

  // Número local (DDD + número, 10 ou 11 dígitos) — adiciona o 55
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`
  }

  return digits
}
