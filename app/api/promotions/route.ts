import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOwnerStore } from '@/lib/ownerStore'
import { loadPromotionContext } from '@/lib/promoData'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'

const COLUMNS = 'id, name, delivery_fee, free_shipping_threshold, offers_delivery, timezone'
const DAY = 86_400_000

// Sugestões da semana + promoções já aplicadas.
export async function GET() {
  const store = await getOwnerStore<any>(COLUMNS)
  if (!store) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  try {
    const ctx = await loadPromotionContext(createAdminClient(), store)
    return NextResponse.json(ctx)
  } catch (err) {
    logError('api:promotions', 'erro ao montar sugestões', err, store.id)
    return NextResponse.json({ error: 'Não foi possível montar as sugestões agora.' }, { status: 500 })
  }
}

// Aplica uma sugestão: o servidor recalcula e aplica a que tem a chave.
export async function POST(request: NextRequest) {
  const store = await getOwnerStore<any>(COLUMNS)
  if (!store) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { key } = await request.json().catch(() => ({}))
  const admin = createAdminClient()
  try {
    const { suggestions } = await loadPromotionContext(admin, store)
    const s = suggestions.find((x) => x.key === key)
    if (!s) return NextResponse.json({ error: 'Essa sugestão mudou ou já está ativa. Atualize a página.' }, { status: 409 })
    if (s.kind === 'cupom') {
      const { data: completo } = await admin.rpc('establishment_has_completo_access', { p_establishment_id: store.id })
      if (completo === false) return NextResponse.json({ error: 'Cupons fazem parte do plano Completo. As ofertas de preço e de entrega grátis funcionam no seu plano.' }, { status: 403 })
    }
    const endsAt = new Date(Date.now() + s.durationDays * DAY).toISOString()
    const ids: { coupon_id?: string; combo_id?: string; product_id?: string } = {}
    let bannerRef: string | null = s.banner.link_ref || null

    if (s.apply.kind === 'preco') {
      const { data: p } = await admin.from('products').select('price').eq('id', s.apply.product_id).eq('establishment_id', store.id).single()
      if (!p || s.apply.promo_price >= Number(p.price)) throw new Error('O preço do produto mudou. Atualize a página.')
      const { error } = await admin.from('products').update({ promo_price: s.apply.promo_price, promo_until: endsAt }).eq('id', s.apply.product_id).eq('establishment_id', store.id)
      if (error) throw error
      ids.product_id = s.apply.product_id
    } else if (s.apply.kind === 'combo') {
      const { data: combo, error } = await admin
        .from('combos')
        .insert({ establishment_id: store.id, name: s.apply.name, description: s.apply.description, price: s.apply.price, is_active: true })
        .select('id')
        .single()
      if (error) throw error
      for (let i = 0; i < s.apply.product_ids.length; i++) {
        const pid = s.apply.product_ids[i]
        const { data: g, error: gErr } = await admin.from('combo_groups').insert({ combo_id: combo.id, name: i === 0 ? 'Prato' : 'Acompanhamento', display_order: i }).select('id').single()
        if (gErr) throw gErr
        const { error: pErr } = await admin.from('combo_group_products').insert({ combo_group_id: g.id, product_id: pid })
        if (pErr) throw pErr
      }
      ids.combo_id = combo.id
      bannerRef = combo.id
    } else if (s.apply.kind === 'cupom') {
      const { data: coupon, error } = await admin
        .from('coupons')
        .insert({
          establishment_id: store.id, code: s.apply.code, discount_type: s.apply.discount_type, discount_value: s.apply.discount_value,
          is_active: true, expires_at: endsAt, max_uses_per_customer: s.apply.max_uses_per_customer, show_on_menu: s.apply.show_on_menu,
        })
        .select('id')
        .single()
      if (error) throw error
      ids.coupon_id = coupon.id
    } else if (s.apply.kind === 'frete') {
      const { error } = await admin.from('establishments').update({ free_shipping_threshold: s.apply.threshold }).eq('id', store.id)
      if (error) throw error
    }

    // Banner no topo do cardápio levando direto à oferta.
    let bannerId: string | null = null
    if (s.banner.title) {
      const { data: banner, error } = await admin
        .from('store_banners')
        .insert({ establishment_id: store.id, title: s.banner.title, subtitle: s.banner.subtitle, link_type: s.banner.link_type, link_ref: bannerRef, ends_at: s.apply.kind === 'frete' ? null : endsAt, display_order: -1 })
        .select('id')
        .single()
      if (error) throw error
      bannerId = banner.id
    }

    const { data: promo, error } = await admin
      .from('store_promotions')
      .insert({
        establishment_id: store.id, kind: s.kind, title: s.title, explanation: s.why.join('\n'), payload: { key: s.key, apply: s.apply, summary: s.summary, howToPromote: s.howToPromote },
        ...ids, banner_id: bannerId, ends_at: s.apply.kind === 'frete' ? null : endsAt,
      })
      .select('id')
      .single()
    if (error) throw error
    if (bannerId) await admin.from('store_banners').update({ promotion_id: promo.id }).eq('id', bannerId)
    return NextResponse.json({ ok: true, id: promo.id, howToPromote: s.howToPromote })
  } catch (err: any) {
    logError('api:promotions', 'erro ao aplicar promoção', err, store.id)
    return NextResponse.json({ error: err?.message?.includes('duplicate') ? 'Já existe um cupom com esse código.' : err?.message || 'Não foi possível aplicar.' }, { status: 500 })
  }
}

// Encerra: desfaz preço/combo/cupom/frete e tira o banner.
export async function PATCH(request: NextRequest) {
  const store = await getOwnerStore<any>(COLUMNS)
  if (!store) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { id } = await request.json().catch(() => ({}))
  const admin = createAdminClient()
  const { data: p } = await admin.from('store_promotions').select('*').eq('id', id).eq('establishment_id', store.id).single()
  if (!p) return NextResponse.json({ error: 'Promoção não encontrada.' }, { status: 404 })
  try {
    if (p.kind === 'preco' && p.product_id) await admin.from('products').update({ promo_price: null, promo_until: null }).eq('id', p.product_id).eq('establishment_id', store.id)
    if (p.kind === 'combo' && p.combo_id) await admin.from('combos').update({ is_active: false }).eq('id', p.combo_id).eq('establishment_id', store.id)
    if (p.kind === 'cupom' && p.coupon_id) await admin.from('coupons').update({ is_active: false }).eq('id', p.coupon_id).eq('establishment_id', store.id)
    if (p.kind === 'frete') {
      const threshold = (p.payload as any)?.apply?.threshold
      await admin.from('establishments').update({ free_shipping_threshold: null }).eq('id', store.id).eq('free_shipping_threshold', threshold)
    }
    if (p.banner_id) await admin.from('store_banners').update({ is_active: false }).eq('id', p.banner_id)
    await admin.from('store_promotions').update({ status: 'encerrada', ended_at: new Date().toISOString() }).eq('id', p.id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    logError('api:promotions', 'erro ao encerrar promoção', err, store.id)
    return NextResponse.json({ error: 'Não foi possível encerrar.' }, { status: 500 })
  }
}
