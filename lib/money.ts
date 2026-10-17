const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** R$ 1.234,56 */
export function formatBRL(value: number): string {
  return BRL.format(Number.isFinite(value) ? value : 0)
}

/** Arredonda para centavos (evita 0,30000000004). */
export function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}
