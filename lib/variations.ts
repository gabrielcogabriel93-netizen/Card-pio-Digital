import type { VariationGroup } from '@/types'

type GroupRule = Pick<VariationGroup, 'allow_multiple' | 'max_select'> & Partial<Pick<VariationGroup, 'is_required' | 'min_select'>>

// Regra de seleção de um grupo de opções: escolha única troca a opção
// (tocar de novo desmarca); múltipla escolha alterna, respeitando o
// limite "escolha até N" (max_select). Espelha a validação do banco em
// price_order_items (migrations 045 e 060).
export function toggleGroupOption(current: string[], optionId: string, group: GroupRule): string[] {
  if (!group.allow_multiple) return current[0] === optionId ? [] : [optionId]
  if (current.includes(optionId)) return current.filter((id) => id !== optionId)
  if (group.max_select && current.length >= group.max_select) return current
  return [...current, optionId]
}

/** Mínimo de escolhas que o grupo exige agora (0 = pode pular). */
export function minRequired(group: GroupRule, count: number): number {
  const min = group.allow_multiple ? group.min_select || 0 : 0
  if (group.is_required) return Math.max(1, min)
  return count > 0 ? min : 0
}

/** Grupo ainda incompleto com estas escolhas. */
export function isGroupMissing(group: GroupRule, count: number): boolean {
  return count < minRequired(group, count)
}

/** "Escolha 1", "Escolha de 2 a 3", "Escolha pelo menos 2", "Escolha até 3"... */
export function groupRuleLabel(group: GroupRule): string {
  if (!group.allow_multiple) return 'Escolha 1'
  const min = group.min_select || 0
  const max = group.max_select || 0
  if (min && max) return min === max ? `Escolha ${min}` : `Escolha de ${min} a ${max}`
  if (min) return `Escolha pelo menos ${min}`
  if (max) return `Escolha até ${max}`
  return 'Escolha quantos quiser'
}
