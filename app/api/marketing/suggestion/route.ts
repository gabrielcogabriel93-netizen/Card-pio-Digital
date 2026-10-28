import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOwnerStore } from '@/lib/ownerStore'
import { generateSuggestion, generateTopicText } from '@/lib/marketingAI'
import { buildTopics, pickTopic, type TopicData } from '@/lib/marketingTopics'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'
export const maxDuration = 60

interface Store {
  id: string
  name: string
  description: string | null
  timezone: string | null
}

const MAX_PER_DAY = 5
const DAY = 86_400_000

function today(timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

// Tudo o que a loja tem de verdade para virar post (migration 058).
async function topicData(admin: SupabaseClient, storeId: string, hasProducts: boolean): Promise<TopicData> {
  const now = Date.now()
  const iso = (ms: number) => new Date(ms).toISOString()
  const [est, coupons, reviews, ratings, loyalty, rewards, combos, newProducts, total, total14, devices] = await Promise.all([
    admin.from('establishments').select('*').eq('id', storeId).single(),
    admin.from('coupons').select('code, discount_type, discount_value, expires_at, max_uses, used_count').eq('establishment_id', storeId).eq('is_active', true).limit(20),
    admin.from('orders').select('id, customer_name, customer_rating, customer_review, created_at').eq('establishment_id', storeId)
      .gte('customer_rating', 4).not('customer_review', 'is', null).gte('created_at', iso(now - 60 * DAY)).order('created_at', { ascending: false }).limit(20),
    admin.from('orders').select('customer_rating').eq('establishment_id', storeId).not('customer_rating', 'is', null).gte('created_at', iso(now - 90 * DAY)).limit(1000),
    admin.from('loyalty_settings').select('is_active, points_per_currency').eq('establishment_id', storeId).maybeSingle(),
    admin.from('loyalty_rewards').select('name, points_cost').eq('establishment_id', storeId).eq('is_active', true).limit(10),
    admin.from('combos').select('id, name, price, image_url, description').eq('establishment_id', storeId).eq('is_active', true).limit(10),
    admin.from('products').select('id, name, price, image_url, description').eq('establishment_id', storeId).eq('is_active', true).gte('created_at', iso(now - 10 * DAY)).limit(10),
    admin.from('orders').select('id', { count: 'exact', head: true }).eq('establishment_id', storeId).neq('status', 'cancelled'),
    admin.from('orders').select('id', { count: 'exact', head: true }).eq('establishment_id', storeId).neq('status', 'cancelled').lt('created_at', iso(now - 14 * DAY)),
    admin.from('customer_devices').select('id', { count: 'exact', head: true }).eq('establishment_id', storeId),
  ])
  const r = (ratings.data || []).map((x) => Number(x.customer_rating)).filter((n) => n >= 1 && n <= 5)
  const e = (est.data || {}) as Record<string, any>
  return {
    coupons: (coupons.data || []).map((c) => ({ ...c, discount_value: Number(c.discount_value) })),
    reviews: (reviews.data || []) as TopicData['reviews'],
    ratingAvg: r.length ? r.reduce((a, b) => a + b, 0) / r.length : null,
    ratingCount: r.length,
    loyalty: { active: !!loyalty.data?.is_active, pointsPerReal: loyalty.data ? Number(loyalty.data.points_per_currency) : null, rewards: rewards.data || [] },
    birthdayPercent: e.birthday_discount_percent ? Number(e.birthday_discount_percent) : null,
    freeShippingThreshold: e.offers_delivery !== false && e.free_shipping_threshold ? Number(e.free_shipping_threshold) : null,
    freeDelivery: e.offers_delivery !== false && e.free_delivery === true,
    combos: (combos.data || []).map((c) => ({ ...c, price: Number(c.price) })),
    newProducts: (newProducts.data || []).map((p) => ({ ...p, price: Number(p.price) })),
    ordersTotal: total.count || 0,
    ordersTotal14dAgo: total14.count || 0,
    appDevices: devices.count || 0,
    hasProducts,
  }
}

// Grava a sugestão; sem a migration 058 ainda, grava sem as colunas do tema.
async function insertSuggestion(admin: SupabaseClient, row: Record<string, unknown>) {
  let res = await admin.from('marketing_suggestions').insert(row).select('*').single()
  if (res.error && /topic|highlight|image_url/.test(res.error.message || '')) {
    const { topic: _t, topic_key: _k, highlight: _h, image_url: _i, ...rest } = row
    res = await admin.from('marketing_suggestions').insert(rest).select('*').single()
  }
  if (res.error) throw res.error
  return res.data
}

async function create(store: Store, variation: number) {
  const admin = createAdminClient()
  const tz = store.timezone || 'America/Sao_Paulo'

  const [{ data: products }, recentRes] = await Promise.all([
    admin
      .from('products')
      .select('id, name, description, price, image_url, is_featured, sold_out_until, categories(name)')
      .eq('establishment_id', store.id)
      .eq('is_active', true)
      .limit(300),
    admin.from('marketing_suggestions').select('*').eq('establishment_id', store.id).order('created_at', { ascending: false }).limit(14),
  ])
  const recent = (recentRes.data || []) as { product_ids: string[] | null; topic?: string | null; topic_key?: string | null }[]

  const now = Date.now()
  const available = (products || [])
    .filter((p) => !p.sold_out_until || new Date(p.sold_out_until).getTime() < now)
    .map((p) => ({ ...p, category: (p as any).categories?.name || null }))

  const topics = buildTopics(await topicData(admin, store.id, available.length > 0))
  const topic = pickTopic(topics, recent.map((r) => ({ topic: r.topic || 'produto', topic_key: r.topic_key || null })), `${today(tz)}:${variation}:${store.id}`)
  if (!topic) return null

  if (topic.kind === 'produto') {
    const suggestion = await generateSuggestion({
      storeName: store.name,
      storeDescription: store.description,
      products: available,
      recentProductIds: recent.slice(0, 7).flatMap((r) => r.product_ids || []),
      timeZone: tz,
      variation,
    })
    if (!suggestion) return null
    return insertSuggestion(admin, { establishment_id: store.id, day: today(tz), ...suggestion, topic: 'produto', topic_key: 'produto' })
  }

  const text = await generateTopicText({ storeName: store.name, storeDescription: store.description, timeZone: tz }, topic)
  return insertSuggestion(admin, {
    establishment_id: store.id,
    day: today(tz),
    product_ids: topic.productId ? [topic.productId] : [],
    headline: text.headline,
    subline: text.subline,
    caption: text.caption,
    hashtags: text.hashtags,
    push_title: text.push_title,
    push_body: text.push_body,
    provider: text.provider,
    topic: topic.kind,
    topic_key: topic.key,
    highlight: text.highlight,
    image_url: topic.imageUrl || null,
  })
}

async function withProducts(row: any) {
  if (!row) return null
  const admin = createAdminClient()
  const { data } = await admin.from('products').select('id, name, price, image_url').in('id', row.product_ids || [])
  return { ...row, products: data || [] }
}

// Sugestão de hoje (cria na primeira visita do dia).
export async function GET() {
  const store = await getOwnerStore<Store>('id, name, description, timezone')
  if (!store) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const admin = createAdminClient()
  try {
    const { data: existing } = await admin
      .from('marketing_suggestions')
      .select('*')
      .eq('establishment_id', store.id)
      .eq('day', today(store.timezone || 'America/Sao_Paulo'))
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const row = existing || (await create(store, 0))
    if (!row) return NextResponse.json({ suggestion: null, reason: 'Cadastre produtos (de preferência com foto) para receber sugestões.' })
    return NextResponse.json({ suggestion: await withProducts(row) })
  } catch (err) {
    logError('api:marketing:suggestion', 'erro ao gerar sugestão do dia', err, store.id)
    return NextResponse.json({ error: 'Não foi possível gerar a sugestão agora.' }, { status: 500 })
  }
}

// "Gerar outra": nova sugestão de hoje, com limite diário.
export async function POST(_request: NextRequest) {
  const store = await getOwnerStore<Store>('id, name, description, timezone')
  if (!store) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const admin = createAdminClient()
  const { count } = await admin
    .from('marketing_suggestions')
    .select('id', { count: 'exact', head: true })
    .eq('establishment_id', store.id)
    .eq('day', today(store.timezone || 'America/Sao_Paulo'))
  if ((count || 0) >= MAX_PER_DAY) {
    return NextResponse.json({ error: `Você já gerou ${MAX_PER_DAY} sugestões hoje. Amanhã tem mais!` }, { status: 429 })
  }
  try {
    const row = await create(store, (count || 0) + 1)
    if (!row) return NextResponse.json({ error: 'Cadastre produtos para receber sugestões.' }, { status: 400 })
    return NextResponse.json({ suggestion: await withProducts(row) })
  } catch (err) {
    logError('api:marketing:suggestion', 'erro ao gerar nova sugestão', err, store.id)
    return NextResponse.json({ error: 'Não foi possível gerar a sugestão agora.' }, { status: 500 })
  }
}
