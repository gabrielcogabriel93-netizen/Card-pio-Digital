// Lista única de formas de pagamento, usada no checkout público, no
// balcão/PDV e na confirmação de pedido no painel — evita que as três
// telas fiquem com opções diferentes entre si.
export const PAYMENT_METHODS = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'Pix' },
  { value: 'cartao_credito', label: 'Cartão de Crédito' },
  { value: 'cartao_debito', label: 'Cartão de Débito' },
  { value: 'outro', label: 'Outro' },
] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]['value']

export function paymentMethodLabel(value?: string | null): string {
  if (!value) return 'Não informado'
  return PAYMENT_METHODS.find((p) => p.value === value)?.label || value
}
