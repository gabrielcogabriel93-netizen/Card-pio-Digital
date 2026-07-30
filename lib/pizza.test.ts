import { describe, it, expect } from 'vitest'
import { computePizzaItemPrice, getCombinableFlavors, buildPizzaVariationLines } from './pizza'
import type { PizzaFlavor, PizzaSize } from '@/types'

const size: PizzaSize = {
  id: 'size-g',
  establishment_id: 'est-1',
  name: 'Grande',
  base_price: 40,
  max_flavors: 3,
  display_order: 0,
  is_active: true,
}

const calabresa: PizzaFlavor = {
  id: 'flavor-calabresa',
  establishment_id: 'est-1',
  name: 'Calabresa',
  category: 'salgada',
  is_active: true,
  display_order: 0,
}

const portuguesa: PizzaFlavor = {
  id: 'flavor-portuguesa',
  establishment_id: 'est-1',
  name: 'Portuguesa',
  category: 'salgada',
  is_active: true,
  display_order: 1,
}

const chocolate: PizzaFlavor = {
  id: 'flavor-chocolate',
  establishment_id: 'est-1',
  name: 'Chocolate',
  category: 'doce',
  is_active: true,
  display_order: 2,
}

describe('computePizzaItemPrice', () => {
  it('charges the price of a single flavor when not split', () => {
    const result = computePizzaItemPrice([{ flavor: calabresa, priceAtSize: 40 }])
    expect(result.unitPrice).toBe(40)
    expect(result.mostExpensiveFlavor.flavor.id).toBe(calabresa.id)
  })

  it('charges the most expensive flavor when split half-and-half', () => {
    const result = computePizzaItemPrice([
      { flavor: calabresa, priceAtSize: 40 },
      { flavor: portuguesa, priceAtSize: 44 },
    ])
    expect(result.unitPrice).toBe(44)
    expect(result.flavorsPrice).toBe(44)
    expect(result.mostExpensiveFlavor.flavor.id).toBe(portuguesa.id)
  })

  it('adds additionals on top of the most expensive flavor', () => {
    const result = computePizzaItemPrice(
      [
        { flavor: calabresa, priceAtSize: 40 },
        { flavor: portuguesa, priceAtSize: 44 },
      ],
      [{ additional: { id: 'a1', establishment_id: 'est-1', name: 'Borda recheada', is_active: true, display_order: 0 }, price: 8 }]
    )
    expect(result.unitPrice).toBe(52)
    expect(result.additionalsPrice).toBe(8)
  })

  it('throws when no flavor is selected', () => {
    expect(() => computePizzaItemPrice([])).toThrow()
  })
})

describe('getCombinableFlavors', () => {
  it('excludes the flavor itself', () => {
    const combinable = getCombinableFlavors([calabresa, portuguesa], calabresa)
    expect(combinable.map((f) => f.id)).not.toContain(calabresa.id)
  })

  it('only combines flavors of the same category', () => {
    const combinable = getCombinableFlavors([calabresa, portuguesa, chocolate], calabresa)
    expect(combinable.map((f) => f.id)).toEqual([portuguesa.id])
  })

  it('lets a flavor without category combine with anything', () => {
    const semCategoria: PizzaFlavor = { ...calabresa, id: 'flavor-sem-categoria', category: null }
    const combinable = getCombinableFlavors([semCategoria, portuguesa, chocolate], semCategoria)
    expect(combinable.map((f) => f.id).sort()).toEqual([chocolate.id, portuguesa.id].sort())
  })

  it('excludes inactive flavors', () => {
    const inativo: PizzaFlavor = { ...portuguesa, id: 'flavor-inativo', is_active: false }
    const combinable = getCombinableFlavors([calabresa, inativo], calabresa)
    expect(combinable).toHaveLength(0)
  })
})

describe('buildPizzaVariationLines', () => {
  it('omits flavor breakdown when a single flavor is chosen', () => {
    const lines = buildPizzaVariationLines(size, [{ flavor: calabresa, priceAtSize: 40 }])
    expect(lines).toEqual([{ group_name: 'Tamanho', option_name: 'Grande', price_delta: 0 }])
  })

  it('lists each flavor when split, with price_delta zeroed to avoid implying they sum', () => {
    const lines = buildPizzaVariationLines(size, [
      { flavor: calabresa, priceAtSize: 40 },
      { flavor: portuguesa, priceAtSize: 44 },
    ])
    expect(lines).toEqual([
      { group_name: 'Tamanho', option_name: 'Grande', price_delta: 0 },
      { group_name: 'Sabor (1/2)', option_name: 'Calabresa', price_delta: 0 },
      { group_name: 'Sabor (2/2)', option_name: 'Portuguesa', price_delta: 0 },
    ])
  })

  it('keeps real price_delta for additionals', () => {
    const lines = buildPizzaVariationLines(
      size,
      [{ flavor: calabresa, priceAtSize: 40 }],
      [{ additional: { id: 'a1', establishment_id: 'est-1', name: 'Borda recheada', is_active: true, display_order: 0 }, price: 8 }]
    )
    expect(lines).toContainEqual({ group_name: 'Adicional', option_name: 'Borda recheada', price_delta: 8 })
  })
})
