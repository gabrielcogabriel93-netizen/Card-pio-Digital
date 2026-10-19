import type { ComboGroup, ComboSelectionConfig } from '@/types'

// ============================================================
// Regras de montagem de um item de combo no carrinho. Função pura, sem
// I/O -- usada tanto no cardápio público quanto no balcão (ver
// ComboOrderModal, compartilhado 100% entre os dois).
// ============================================================

export interface ComboSlotSelection {
  group: ComboGroup
  product: { id: string; name: string }
  // Pizza do combo: sabores a mais (meio a meio) e adicionais pagos.
  extraFlavors?: { id: string; name: string }[]
  additionals?: { id: string; name: string; price: number }[]
}

export interface ComboOrderResult {
  variations: { group_name: string; option_name: string; price_delta: number }[]
  unitPrice: number
  comboId: string
  selections: { group_id: string; group_name: string; product_id: string; product_name: string }[]
  config: { kind: 'combo'; combo_id: string; selections: ComboSelectionConfig[] }
}

/**
 * Quantos sabores a pizza do combo aceita: a regra do lojista para o combo
 * (1 a 4) vale por si; sem regra, vale o limite do tamanho (migration 052).
 */
export function comboPizzaFlavorLimit(group: Pick<ComboGroup, 'pizza_max_flavors'>, sizeMaxFlavors: number | null | undefined): number {
  return Math.max(1, Math.min(4, group.pizza_max_flavors || sizeMaxFlavors || 1))
}

/**
 * Preço do combo é o fixo cadastrado pelo lojista. Os sabores escolhidos
 * não mudam o total; só os adicionais da pizza (se o lojista liberou)
 * somam, pelo preço do tamanho, igual à pizza avulsa. O servidor refaz
 * a conta (price_order_items, migration 050).
 */
export function buildComboOrderResult(
  combo: { id: string; price: number },
  slotSelections: ComboSlotSelection[]
): ComboOrderResult {
  const flavorLabel = (sel: ComboSlotSelection) =>
    [sel.product.name, ...[...(sel.extraFlavors || [])].map((f) => f.name).sort((a, b) => a.localeCompare(b))].join(' + ')
  const variations: ComboOrderResult['variations'] = []
  for (const sel of slotSelections) {
    variations.push({ group_name: sel.group.name, option_name: flavorLabel(sel), price_delta: 0 })
    for (const add of sel.additionals || []) {
      variations.push({ group_name: `Adicional (${sel.group.name})`, option_name: add.name, price_delta: add.price })
    }
  }
  const extras = slotSelections.reduce((sum, sel) => sum + (sel.additionals || []).reduce((s, a) => s + Number(a.price || 0), 0), 0)

  return {
    variations,
    unitPrice: Math.round((Number(combo.price) + extras) * 100) / 100,
    comboId: combo.id,
    selections: slotSelections.map((sel) => ({
      group_id: sel.group.id,
      group_name: sel.group.name,
      product_id: sel.product.id,
      product_name: flavorLabel(sel),
    })),
    config: {
      kind: 'combo',
      combo_id: combo.id,
      selections: slotSelections.map((sel) => ({
        group_id: sel.group.id,
        product_id: sel.product.id,
        ...(sel.extraFlavors?.length ? { flavor_product_ids: sel.extraFlavors.map((f) => f.id) } : {}),
        ...(sel.additionals?.length ? { additional_ids: sel.additionals.map((a) => a.id) } : {}),
      })),
    },
  }
}

/** true quando todo grupo já tem escolha. */
export function isComboSelectionComplete(groups: ComboGroup[], selectedByGroup: Record<string, string>): boolean {
  return groups.every((g) => !!selectedByGroup[g.id])
}
