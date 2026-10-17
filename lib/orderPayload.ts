import type { CartItem, OrderItem, OrderItemConfig } from '@/types'

// O cardápio envia só ids e quantidades para place_order (migration
// 045); preço, desconto e frete são calculados pelo banco. Estas funções
// puras montam esse formato a partir do carrinho e fazem o caminho
// contrário para "pedir de novo".

export interface OrderItemPayload {
  kind: OrderItemConfig['kind']
  quantity: number
  note?: string
  product_id?: string
  option_ids?: string[]
  size_id?: string
  flavor_ids?: string[]
  additional_ids?: string[]
  combo_id?: string
  selections?: { group_id: string; product_id: string }[]
}

export function cartItemToPayload(item: Pick<CartItem<{ id: string }>, 'product' | 'quantity' | 'note' | 'config' | 'combo'>): OrderItemPayload {
  const note = item.note?.trim() || undefined
  const config: OrderItemConfig =
    item.config ||
    (item.combo
      ? {
          kind: 'combo',
          combo_id: item.combo.combo_id,
          selections: item.combo.selections.map((s) => ({ group_id: s.group_id, product_id: s.product_id })),
        }
      : { kind: 'product', product_id: item.product.id, option_ids: [] })
  return { ...config, quantity: item.quantity, ...(note ? { note } : {}) }
}

export function buildOrderItemsPayload(cart: Pick<CartItem<{ id: string }>, 'product' | 'quantity' | 'note' | 'config' | 'combo'>[]): OrderItemPayload[] {
  return cart.map(cartItemToPayload)
}

// Chave que identifica "o mesmo item" no carrinho (mesmo produto, mesmas
// escolhas, mesma observação) para somar quantidade em vez de duplicar.
export function cartItemKey(item: Pick<CartItem<{ id: string }>, 'product' | 'note' | 'config' | 'variations'>): string {
  const config = item.config ? JSON.stringify(normalizeConfig(item.config)) : ''
  const variations = item.variations.map((v) => `${v.group_name}:${v.option_name}`).sort().join('|')
  return [item.product.id, config, variations, (item.note || '').trim().toLowerCase()].join('#')
}

function normalizeConfig(config: OrderItemConfig): OrderItemConfig {
  if (config.kind === 'product') return { ...config, option_ids: [...(config.option_ids || [])].sort() }
  if (config.kind === 'pizza') return { ...config, additional_ids: [...(config.additional_ids || [])].sort() }
  return { ...config, selections: [...config.selections].sort((a, b) => a.group_id.localeCompare(b.group_id)) }
}

// "Pedir de novo": itens de um pedido antigo viram payload outra vez. Só
// funciona para pedidos feitos depois da migration 045 (que guardam
// `config`); os anteriores voltam apenas como produto simples.
export function orderItemsToPayload(items: OrderItem[]): OrderItemPayload[] {
  return items
    .map((item): OrderItemPayload | null => {
      if (item.config) return { ...item.config, quantity: item.quantity, ...(item.note ? { note: item.note } : {}) }
      if (item.combo_id && item.combo_selections) {
        return {
          kind: 'combo',
          combo_id: item.combo_id,
          selections: item.combo_selections.map((s) => ({ group_id: s.group_id, product_id: s.product_id })),
          quantity: item.quantity,
        }
      }
      if (!item.variations || item.variations.length === 0) {
        return { kind: 'product', product_id: item.product_id, option_ids: [], quantity: item.quantity }
      }
      return null
    })
    .filter((p): p is OrderItemPayload => p !== null)
}
