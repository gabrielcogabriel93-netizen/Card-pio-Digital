import { describe, it, expect } from 'vitest'
import { buildComboOrderResult, comboPizzaFlavorLimit, isComboSelectionComplete } from './combo'
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

describe('pizza do combo (regras do lojista)', () => {
  const pizza = group({ id: 'gp', name: 'Pizza grande', is_pizza_slot: true, fixed_pizza_size_id: 's1' })

  it('limite de sabores: a regra do combo vale por si; sem regra, o do tamanho', () => {
    expect(comboPizzaFlavorLimit({ pizza_max_flavors: null }, 3)).toBe(3)
    expect(comboPizzaFlavorLimit({ pizza_max_flavors: 1 }, 3)).toBe(1)
    expect(comboPizzaFlavorLimit({ pizza_max_flavors: 3 }, 2)).toBe(3)
    expect(comboPizzaFlavorLimit({ pizza_max_flavors: null }, null)).toBe(1)
  })

  it('meio a meio no mesmo preço; adicional soma e vai no config', () => {
    const r = buildComboOrderResult({ id: 'c1', price: 59.9 }, [{
      group: pizza,
      product: { id: 'p1', name: 'Frango' },
      extraFlavors: [{ id: 'p2', name: 'Calabresa' }],
      additionals: [{ id: 'a1', name: 'Borda', price: 8 }],
    }])
    expect(r.unitPrice).toBe(67.9)
    expect(r.variations[0]).toEqual({ group_name: 'Pizza grande', option_name: 'Frango + Calabresa', price_delta: 0 })
    expect(r.variations[1]).toEqual({ group_name: 'Adicional (Pizza grande)', option_name: 'Borda', price_delta: 8 })
    expect(r.config.selections[0]).toEqual({ group_id: 'gp', product_id: 'p1', flavor_product_ids: ['p2'], additional_ids: ['a1'] })
  })

  it('sem extras o config continua igual ao formato antigo', () => {
    const r = buildComboOrderResult({ id: 'c1', price: 30 }, [{ group: pizza, product: { id: 'p1', name: 'Frango' } }])
    expect(r.config.selections[0]).toEqual({ group_id: 'gp', product_id: 'p1' })
    expect(r.unitPrice).toBe(30)
  })
})
