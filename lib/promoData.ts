// Dados da loja para o estrategista de promoções (servidor, service role,
// sempre com o id da loja do dono logado).
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildPromotions, weekKeyOf, type StrategyProduct } from './promoStrategist'
import { weekdayIn } from './weekdays'
import { fetchAllRows } from './salesReport'

interface Store {
  id: string
  name: string
  delivery_fee: number | null
  free_shipping_threshold: number | null
  offers_delivery: boolean | null
  timezone: string | null
}

export async function loadPromotionContext(admin: SupabaseClient, store: Store, now = new Date()) {
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString()
  const [products, categories, groups, orders, coupons, promos] = await Promise.all([
    admin.from('products').select('*').eq('establishment_id', store.id).eq('is_active', true),
    admin.from('categories').select('id, name').eq('establishment_id', store.id),
    admin.from('variation_groups').select('product_id, products!inner(establishment_id)').eq('products.establishment_id', store.id),
    fetchAllRows<{ items: any[]; total: number; created_at: string; status: string }>((f, t) =>
      admin.from('orders').select('items, total, created_at, status').eq('establishment_id', store.id).gte('created_at', since).in('status', ['confirmed', 'preparing', 'completed']).range(f, t)),
    admin.from('coupons').select('code').eq('establishment_id', store.id),
    admin.from('store_promotions').select('*').eq('establishment_id', store.id).order('created_at', { ascending: false }).limit(50),
  ])

  const catName = new Map((categories.data || []).map((c) => [c.id, c.name]))
  const withOptions = new Set((groups.data || []).map((g: any) => g.product_id))
  const sales = new Map<string, { qty: number; revenue: number }>()
  const weekday = [0, 0, 0, 0, 0, 0, 0]
  for (const o of orders) {
    weekday[weekdayIn(store.timezone, new Date(o.created_at))]++
    for (const i of o.items || []) {
      if (i.combo_id || !i.product_id) continue
      const s = sales.get(i.product_id) || { qty: 0, revenue: 0 }
      s.qty += Number(i.quantity) || 0
      s.revenue += Number(i.total_price) || 0
      sales.set(i.product_id, s)
    }
  }

  const list: StrategyProduct[] = (products.data || [])
    .filter((p) => !p.pizza_flavor_id)
    .map((p) => ({
      id: p.id,
      name: p.name,
      price: Number(p.price),
      cost_price: p.cost_price != null ? Number(p.cost_price) : null,
      promo_price: p.promo_price != null && (!p.promo_until || new Date(p.promo_until) > now) ? Number(p.promo_price) : null,
      category: p.category_id ? catName.get(p.category_id) || null : null,
      image_url: p.image_url,
      has_options: withOptions.has(p.id),
      qty30: sales.get(p.id)?.qty || 0,
      revenue30: sales.get(p.id)?.revenue || 0,
    }))

  const active = (promos.data || []).filter((p) => p.status === 'ativa' && (!p.ends_at || new Date(p.ends_at) > now))
  const suggestions = buildPromotions({
    storeName: store.name,
    products: list,
    orders30: orders.length,
    avgTicket: orders.length ? orders.reduce((a, o) => a + Number(o.total || 0), 0) / orders.length : null,
    weekdayOrders: weekday,
    deliveryFee: Number(store.delivery_fee) || 0,
    freeShippingThreshold: store.free_shipping_threshold ? Number(store.free_shipping_threshold) : null,
    offersDelivery: store.offers_delivery !== false,
    existingCouponCodes: (coupons.data || []).map((c) => c.code),
    activeKeys: active.map((p) => (p.payload as { key?: string })?.key).filter(Boolean) as string[],
    weekKey: weekKeyOf(now),
  })
  return { suggestions, promotions: promos.data || [], promotionsError: promos.error?.message || null, orders30: orders.length }
}
