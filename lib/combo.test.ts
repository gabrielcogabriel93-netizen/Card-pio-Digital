import { describe, it, expect } from 'vitest'
import { buildComboOrderResult, isComboSelectionComplete } from './combo'
import type { ComboGroup } from '@/types'

const group = (overrides: Partial<ComboGroup> = {}): ComboGroup => ({
  id: 'g1',
  combo_id: 'c1',
  name: 'Escolha o sabor',
  display_order: 0,
  is_pizza_slot: false,
  fixed_pizza_size_id: null,
  min_select: 1,
  max_select: 1,
  ...overrides,
})

describe('buildComboOrderResult', () => {
  it('uses the combo fixed price regardless of selections', () => {
    const result = buildComboOrderResult(
      { id: 'combo-1', price: 49.9 },
      [
        { group: group({ id: 'g1', name: 'Sabor' }), product: { id: 'p1', name: 'Calabresa' } },
        { group: group({ id: 'g2', name: 'Bebida' }), product: { id: 'p2', name: 'Coca-Cola' } },
      ]
    )
    expect(result.unitPrice).toBe(49.9)
    expect(result.comboId).toBe('combo-1')
  })

  it('builds display-only variations with price_delta always 0', () => {
    const result = buildComboOrderResult(
      { id: 'combo-1', price: 39.9 },
      [{ group: group({ name: 'Sobremesa' }), product: { id: 'p1', name: 'Brownie' } }]
    )
    expect(result.variations).toEqual([{ group_name: 'Sobremesa', option_name: 'Brownie', price_delta: 0 }])
  })

  it('carries the chosen product per slot for stock decrement', () => {
    const result = buildComboOrderResult(
      { id: 'combo-1', price: 39.9 },
      [{ group: group({ id: 'g1', name: 'Bebida' }), product: { id: 'p1', name: 'Suco' } }]
    )
    expect(result.selections).toEqual([{ group_id: 'g1', group_name: 'Bebida', product_id: 'p1', product_name: 'Suco' }])
  })
})

describe('isComboSelectionComplete', () => {
  it('is false when no group has a selection', () => {
    expect(isComboSelectionComplete([group({ id: 'g1' }), group({ id: 'g2' })], {})).toBe(false)
  })

  it('is false when only some groups have a selection', () => {
    expect(isComboSelectionComplete([group({ id: 'g1' }), group({ id: 'g2' })], { g1: 'p1' })).toBe(false)
  })

  it('is true when every group has a selection', () => {
    expect(isComboSelectionComplete([group({ id: 'g1' }), group({ id: 'g2' })], { g1: 'p1', g2: 'p2' })).toBe(true)
  })
})
