import type { SupabaseClient } from '@supabase/supabase-js'
import type { OrderItem } from '@/types'

// Tolerância de arredondamento (centavos) entre o que foi calculado no
// carrinho (JS, ponto flutuante) e o que é conferido aqui.
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

interface OrderForPricingCheck {
  items: OrderItem[]
  subtotal: number
  discount: number | null
  shipping_fee: number
  total: number
  coupon_code: string | null
  establishment_id: string
  customer_phone: string
}

/**
 * Confere um PISO de preço pro pedido antes de gerar uma cobrança de
 * verdade no Mercado Pago — barra o golpe mais óbvio (total manipulado
 * pra quase zero no carrinho, que é montado inteiramente no navegador do
 * cliente).
 *
 * Limitação assumida conscientemente: não recalcula o preço exato de
 * variações/sabor de pizza linha a linha — o pedido hoje só guarda o
 * nome da opção escolhida (texto), não o id, então não dá pra
 * reconstruir o preço exato de cada item sem mudar o formato do
 * carrinho. Mas nenhuma variação/adicional deste sistema DESCONTA do
 * preço base do produto — todas só somam — então a soma do preço base
 * atual dos produtos já é um piso seguro: um pedido de verdade nunca
 * custa menos que isso. Fecha o golpe demonstrado na auditoria (total
 * quase zero); não fecha uma manipulação fina de poucos reais nas
 * variações. Recalcular isso com precisão fica para uma próxima rodada,
 * quando o carrinho passar a guardar o id de cada opção escolhida.
 */
export async function validateOrderPricingFloor(
  admin: SupabaseClient,
  order: OrderForPricingCheck
): Promise<PricingValidationResult> {
  const subtotal = Number(order.subtotal)
  const discount = Number(order.discount || 0)
  const shippingFee = Number(order.shipping_fee || 0)
  const total = Number(order.total)

  const arithmetic = checkOrderArithmetic(subtotal, discount, shippingFee, total)
  if (!arithmetic.valid) return arithmetic

  if (!order.items || order.items.length === 0) {
    return { valid: false, reason: 'Pedido sem itens.' }
  }

  const productIds = Array.from(new Set(order.items.map((item) => item.product_id)))
  const { data: products, error: productsError } = await admin
    .from('products')
    .select('id, price')
    .in('id', productIds)

  if (productsError) return { valid: false, reason: 'Erro ao conferir preço dos produtos.' }

  const priceById = new Map((products || []).map((p) => [p.id, Number(p.price)]))
  let minSubtotal = 0
  for (const item of order.items) {
    const basePrice = priceById.get(item.product_id)
    if (basePrice === undefined) {
      return { valid: false, reason: `Produto ${item.product_id} do pedido não foi encontrado no cardápio.` }
    }
    minSubtotal += basePrice * item.quantity
  }

  if (subtotal < minSubtotal - ROUNDING_TOLERANCE) {
    return { valid: false, reason: 'O subtotal do pedido está abaixo do preço mínimo dos produtos.' }
  }

  if (order.coupon_code) {
    const { data: couponRows, error: couponError } = await admin.rpc('validate_coupon', {
      p_establishment_id: order.establishment_id,
      p_code: order.coupon_code,
      p_customer_phone: order.customer_phone,
    })
    if (couponError) return { valid: false, reason: 'Erro ao conferir o cupom do pedido.' }

    const result = couponRows?.[0]
    if (!result?.valid) {
      return { valid: false, reason: 'O cupom informado no pedido não é mais válido.' }
    }

    const expectedDiscount =
      result.discount_type === 'percent' ? subtotal * (Number(result.discount_value) / 100)
      : result.discount_type === 'fixed' ? Math.min(Number(result.discount_value), subtotal)
      : 0 // free_shipping não desconta o subtotal, desconta o frete

    if (discount > expectedDiscount + ROUNDING_TOLERANCE) {
      return { valid: false, reason: 'O desconto do pedido é maior do que o cupom permite.' }
    }
  } else {
    // Sem cupom, o único desconto legítimo é o de aniversário — limitado
    // ao percentual configurado pela loja (não dá pra confirmar aqui se
    // o cliente faz aniversário hoje, mas ao menos limita o teto).
    const { data: establishment } = await admin
      .from('establishments')
      .select('birthday_discount_percent')
      .eq('id', order.establishment_id)
      .maybeSingle()

    const maxPercent = Number(establishment?.birthday_discount_percent || 0)
    const maxDiscount = subtotal * (maxPercent / 100)
    if (discount > maxDiscount + ROUNDING_TOLERANCE) {
      return { valid: false, reason: 'O desconto do pedido não corresponde a nenhum cupom nem ao desconto de aniversário configurado.' }
    }
  }

  return { valid: true }
}
