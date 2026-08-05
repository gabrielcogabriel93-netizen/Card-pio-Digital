// Lista única de formas de pagamento, usada no checkout público, no
// balcão/PDV e na confirmação de pedido no painel — evita que as três
// telas fiquem com opções diferentes entre si.
export const PAYMENT_METHODS = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'Pix' },
  { value: 'mercadopago_pix', label: 'Pix automático (Mercado Pago)' },
  { value: 'cartao_credito', label: 'Cartão de Crédito' },
  { value: 'cartao_debito', label: 'Cartão de Débito' },
  { value: 'outro', label: 'Outro' },
] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]['value']

// Pedido mínimo pra liberar Pix automático (Mercado Pago): abaixo disso a
// cobrança de application_fee (comissão fixa da plataforma, ver
// MERCADOPAGO_COMMISSION_AMOUNT em lib/mercadoPago.ts) pode chegar perto
// ou igual ao total do pedido, e o Mercado Pago recusa a cobrança nesse
// caso. Checado nos dois lados: escondido do cliente aqui no cardápio
// (PublicMenuClient) e validado de novo no servidor
// (api/mercadopago/create-payment) como segunda camada.
export const MERCADOPAGO_MIN_ORDER_TOTAL = 5

export function paymentMethodLabel(value?: string | null): string {
  if (!value) return 'Não informado'
  return PAYMENT_METHODS.find((p) => p.value === value)?.label || value
}
