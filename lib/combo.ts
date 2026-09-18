import type { ComboGroup } from '@/types'

// ============================================================
// Regras de montagem de um item de combo no carrinho. Função pura, sem
// I/O -- usada tanto no cardápio público quanto no balcão (ver
// ComboOrderModal, compartilhado 100% entre os dois).
// ============================================================

export interface ComboSlotSelection {
  group: ComboGroup
  product: { id: string; name: string }
}

export interface ComboOrderResult {
  variations: { group_name: string; option_name: string; price_delta: number }[]
  unitPrice: number
  comboId: string
  selections: { group_id: string; group_name: string; product_id: string; product_name: string }[]
}

/**
 * Preço do combo é sempre o preço fixo cadastrado pelo lojista -- os
 * componentes escolhidos NUNCA alteram o total (price_delta sempre 0
 * nas linhas de exibição), diferente de variação/pizza avulsa.
 */
export function buildComboOrderResult(
  combo: { id: string; price: number },
  slotSelections: ComboSlotSelection[]
): ComboOrderResult {
  return {
    variations: slotSelections.map((sel) => ({
      group_name: sel.group.name,
      option_name: sel.product.name,
      price_delta: 0,
    })),
    unitPrice: Number(combo.price),
    comboId: combo.id,
    selections: slotSelections.map((sel) => ({
      group_id: sel.group.id,
      group_name: sel.group.name,
      product_id: sel.product.id,
      product_name: sel.product.name,
    })),
  }
}

/** true quando todo grupo (v1: min_select=max_select=1) já tem escolha. */
export function isComboSelectionComplete(groups: ComboGroup[], selectedByGroup: Record<string, string>): boolean {
  return groups.every((g) => !!selectedByGroup[g.id])
}
