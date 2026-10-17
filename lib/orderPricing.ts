// Tolerância de arredondamento (centavos) entre valores calculados em
// pontos diferentes (banco x JS).
const ROUNDING_TOLERANCE = 0.02

export interface PricingValidationResult {
  valid: boolean
  reason?: string
}

/** Confere se total = subtotal - desconto + frete, dentro da tolerância. */
export function checkOrderArithmetic(subtotal: number, discount: number, shippingFee: number, total: number): PricingValidationResult {
  const expected = subtotal - discount + shippingFee
  if (Math.abs(expected - total) > ROUNDING_TOLERANCE) {
    return { valid: false, reason: 'O total do pedido não bate com subtotal - desconto + frete.' }
  }
  return { valid: true }
}

interface OrderForPixCheck {
  priced_by_server?: boolean | null
  subtotal: number
  discount: number | null
  shipping_fee: number | null
  total: number
  items: unknown[] | null
}

/**
 * Antes de gerar uma cobrança Pix de verdade: o pedido precisa ter sido
 * montado e precificado pelo banco (place_order, migration 045) -- desde
 * então o navegador não grava mais preço nenhum -- e a conta precisa
 * fechar. Substitui a antiga checagem de "piso de preço", que recusava
 * pedido com combo e com desconto de aniversário.
 */
export function validateOrderForPixCharge(order: OrderForPixCheck): PricingValidationResult {
  if (!order.priced_by_server) {
    return { valid: false, reason: 'Pedido não foi precificado pelo servidor.' }
  }
  if (!order.items || order.items.length === 0) {
    return { valid: false, reason: 'Pedido sem itens.' }
  }
  return checkOrderArithmetic(Number(order.subtotal), Number(order.discount || 0), Number(order.shipping_fee || 0), Number(order.total))
}
