import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOwnerStore } from '@/lib/ownerStore'
import { generateSuggestion } from '@/lib/marketingAI'
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

function today(timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

async function create(store: Store, variation: number) {
  const admin = createAdminClient()
  const tz = store.timezone || 'America/Sao_Paulo'

  const [{ data: products }, { data: recent }] = await Promise.all([
    admin
      .from('products')
      .select('id, name, description, price, image_url, is_featured, sold_out_until, categories(name)')
      .eq('establishment_id', store.id)
      .eq('is_active', true)
      .limit(300),
    admin.from('marketing_suggestions').select('product_ids').eq('establishment_id', store.id).order('created_at', { ascending: false }).limit(7),
  ])

  const now = Date.now()
  const available = (products || [])
    .filter((p) => !p.sold_out_until || new Date(p.sold_out_until).getTime() < now)
    .map((p) => ({ ...p, category: (p as any).categories?.name || null }))
  if (available.length === 0) return null

  const suggestion = await generateSuggestion({
    storeName: store.name,
    storeDescription: store.description,
    products: available,
    recentProductIds: (recent || []).flatMap((r) => r.product_ids || []),
    timeZone: tz,
    variation,
  })
  if (!suggestion) return null

  const { data, error } = await admin
    .from('marketing_suggestions')
    .insert({ establishment_id: store.id, day: today(tz), ...suggestion })
    .select('*')
    .single()
  if (error) throw error
  return data
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
