import { timingSafeEqual } from 'node:crypto'

/**
 * Compara dois segredos (header recebido x variável de ambiente) em tempo
 * constante — evita timing attack, mesma técnica já usada na validação de
 * assinatura do Mercado Pago (ver lib/mercadoPago.ts). Usado nas rotas
 * autenticadas por segredo compartilhado (cron, push) em vez de `===`, que
 * vaza quantos caracteres iniciais bateram através do tempo de resposta.
 */
export function safeCompareSecret(received: string | null | undefined, expected: string | null | undefined): boolean {
  if (!received || !expected) return false

  const receivedBuffer = Buffer.from(received)
  const expectedBuffer = Buffer.from(expected)
  if (receivedBuffer.length !== expectedBuffer.length) return false

  return timingSafeEqual(receivedBuffer, expectedBuffer)
}
