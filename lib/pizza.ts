import type { PizzaAdditional, PizzaFlavor, PizzaSize } from '@/types'

// ============================================================
// Regras de precificação de pizza (sabor/tamanho/meio-a-meio/adicional).
// Função pura, sem I/O — usada tanto no cardápio público quanto no balcão,
// e testável isoladamente.
// ============================================================

export interface PizzaFlavorSelection {
  flavor: PizzaFlavor
  /** size.base_price + acréscimo desse sabor nesse tamanho. */
  priceAtSize: number
}

export interface PizzaAdditionalSelection {
  additional: PizzaAdditional
  /** preço do adicional pro tamanho escolhido. */
  price: number
}

export interface PizzaPriceResult {
  unitPrice: number
  /** preço do sabor mais caro entre os escolhidos (regra do meio a meio). */
  flavorsPrice: number
  additionalsPrice: number
  mostExpensiveFlavor: PizzaFlavorSelection
}

export function computeFlavorPriceAtSize(size: PizzaSize, priceDelta: number): number {
  return Number(size.base_price) + Number(priceDelta || 0)
}

/**
 * Preço final do item: quando o cliente divide entre 2+ sabores, cobra-se
 * o valor do sabor mais caro entre os escolhidos (não soma todos) — regra
 * padrão de pizzaria. Adicionais são sempre aditivos.
 */
export function computePizzaItemPrice(
  flavorSelections: PizzaFlavorSelection[],
  additionalSelections: PizzaAdditionalSelection[] = []
): PizzaPriceResult {
  if (flavorSelections.length === 0) {
    throw new Error('Selecione ao menos um sabor')
  }

  const mostExpensiveFlavor = flavorSelections.reduce((max, current) =>
    current.priceAtSize > max.priceAtSize ? current : max
  )
  const additionalsPrice = additionalSelections.reduce((sum, sel) => sum + Number(sel.price), 0)

  return {
    unitPrice: mostExpensiveFlavor.priceAtSize + additionalsPrice,
    flavorsPrice: mostExpensiveFlavor.priceAtSize,
    additionalsPrice,
    mostExpensiveFlavor,
  }
}

/**
 * Sabores que podem ser combinados com `currentFlavor` num meio a meio:
 * exclui o próprio sabor (o produto já é ele) e, se algum dos dois tiver
 * categoria definida (salgada/doce), só combina dentro da mesma categoria.
 * Sabor sem categoria combina com qualquer um.
 */
export function getCombinableFlavors(allFlavors: PizzaFlavor[], currentFlavor: PizzaFlavor): PizzaFlavor[] {
  return allFlavors.filter((flavor) => {
    if (flavor.id === currentFlavor.id) return false
    if (!flavor.is_active) return false
    if (currentFlavor.category && flavor.category && currentFlavor.category !== flavor.category) return false
    return true
  })
}

/**
 * Monta as linhas de exibição do item de pizza no formato que
 * `CartItem`/`OrderItem` já usam ({group_name, option_name, price_delta}),
 * pra reaproveitar toda a renderização existente (WhatsApp, recibo,
 * detalhe do pedido) sem precisar mudar esses tipos.
 */
export function buildPizzaVariationLines(
  size: PizzaSize,
  flavorSelections: PizzaFlavorSelection[],
  additionalSelections: PizzaAdditionalSelection[] = []
): { group_name: string; option_name: string; price_delta: number }[] {
  const lines: { group_name: string; option_name: string; price_delta: number }[] = [
    { group_name: 'Tamanho', option_name: size.name, price_delta: 0 },
  ]

  // Com um só sabor, o nome do produto já diz qual é — só detalha quando
  // dividido, pra não ficar redundante.
  if (flavorSelections.length > 1) {
    flavorSelections.forEach((sel, index) => {
      lines.push({
        group_name: `Sabor (${index + 1}/${flavorSelections.length})`,
        option_name: sel.flavor.name,
        price_delta: 0,
      })
    })
  }

  additionalSelections.forEach((sel) => {
    lines.push({ group_name: 'Adicional', option_name: sel.additional.name, price_delta: Number(sel.price) })
  })

  return lines
}
