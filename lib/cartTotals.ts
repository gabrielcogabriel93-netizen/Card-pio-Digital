import { roundCents } from './money'

// Prévia do total no carrinho, com as mesmas regras que place_order usa
// no banco (migration 045). É só para mostrar ao cliente enquanto ele
// monta o pedido: o valor cobrado é sempre o que o servidor devolve.

export type DiscountSource =
  | { kind: 'coupon'; discountType: 'percent' | 'fixed' | 'free_shipping'; value: number }
  | { kind: 'loyalty'; benefitType: 'percent_discount' | 'fixed_discount' | 'free_shipping'; value: number | null }
  | { kind: 'birthday'; percent: number }
  | null

export interface CartTotalsInput {
  subtotal: number
  orderType: 'delivery' | 'pickup' | 'mesa'
  deliveryFee: number
  freeShippingThreshold?: number | null
  discount: DiscountSource
}

export interface CartTotals {
  subtotal: number
  discount: number
  deliveryFee: number
  // Taxa que seria cobrada se não houvesse frete grátis (para exibir "Grátis").
  baseDeliveryFee: number
  freeShipping: boolean
  total: number
  // Quanto falta para o frete grátis por valor mínimo (0 = já ganhou / não se aplica).
  missingForFreeShipping: number
}

export function computeCartTotals(input: CartTotalsInput): CartTotals {
  const subtotal = roundCents(input.subtotal)
  const baseDeliveryFee = input.orderType === 'delivery' ? roundCents(Math.max(0, input.deliveryFee)) : 0
  const threshold = Number(input.freeShippingThreshold) || 0
  const qualifiesThreshold = input.orderType === 'delivery' && threshold > 0 && subtotal >= threshold

  let discount = 0
  let freeShippingByDiscount = false
  const d = input.discount
  if (d?.kind === 'coupon') {
    if (d.discountType === 'percent') discount = (subtotal * d.value) / 100
    else if (d.discountType === 'fixed') discount = Math.min(d.value, subtotal)
    else freeShippingByDiscount = true
  } else if (d?.kind === 'loyalty') {
    if (d.benefitType === 'percent_discount') discount = (subtotal * (d.value || 0)) / 100
    else if (d.benefitType === 'fixed_discount') discount = Math.min(d.value || 0, subtotal)
    else freeShippingByDiscount = true
  } else if (d?.kind === 'birthday') {
    discount = (subtotal * d.percent) / 100
  }
  discount = roundCents(discount)

  const freeShipping = baseDeliveryFee > 0 && (qualifiesThreshold || freeShippingByDiscount)
  const deliveryFee = freeShipping || qualifiesThreshold || freeShippingByDiscount ? 0 : baseDeliveryFee
  const total = roundCents(Math.max(0, subtotal - discount + deliveryFee))
  const missingForFreeShipping =
    input.orderType === 'delivery' && threshold > 0 && !qualifiesThreshold ? roundCents(threshold - subtotal) : 0

  return { subtotal, discount, deliveryFee, baseDeliveryFee, freeShipping, total, missingForFreeShipping }
}
