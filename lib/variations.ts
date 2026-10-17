import type { VariationGroup } from '@/types'

// Regra de seleção de um grupo de opções: escolha única troca a opção
// (tocar de novo desmarca); múltipla escolha alterna, respeitando o
// limite "escolha até N" (max_select). Espelha a validação do banco em
// price_order_items (migration 045).
export function toggleGroupOption(
  current: string[],
  optionId: string,
  group: Pick<VariationGroup, 'allow_multiple' | 'max_select'>
): string[] {
  if (!group.allow_multiple) return current[0] === optionId ? [] : [optionId]
  if (current.includes(optionId)) return current.filter((id) => id !== optionId)
  if (group.max_select && current.length >= group.max_select) return current
  return [...current, optionId]
}
