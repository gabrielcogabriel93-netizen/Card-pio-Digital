'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SmartImage } from '@/components/SmartImage'
import { formatBRL } from '@/lib/money'
import { couponBenefit } from '@/lib/marketingTopics'
import type { PublicProduct } from '@/types'
import { Flame, Tag } from 'lucide-react'

interface ManualBanner { id: string; title: string | null; subtitle: string | null; image_url: string | null; link_type: string; link_ref: string | null }
interface MenuCoupon { code: string; discount_type: string; discount_value: number; expires_at: string | null }
interface Payload { banners: ManualBanner[]; top_products: string[]; coupons: MenuCoupon[] }

type Slide =
  | { kind: 'manual'; key: string; banner: ManualBanner }
  | { kind: 'top'; key: string; product: PublicProduct; rank: number }
  | { kind: 'coupon'; key: string; coupon: MenuCoupon }

/**
 * Carrossel acima da busca (migration 060): banners do lojista, os mais
 * pedidos dos últimos 30 dias e os cupons divulgados. Cada slide leva ao
 * produto, combo, categoria ou aplica o cupom na sacola.
 */
export function BannerCarousel({ establishmentId, products, onProduct, onCombo, onCategory, onCoupon }: {
  establishmentId: string
  products: PublicProduct[]
  onProduct: (product: PublicProduct) => void
  onCombo: (comboId: string) => void
  onCategory: (categoryId: string) => void
  onCoupon: (code: string) => void
}) {
  const [data, setData] = useState<Payload | null>(null)
  const [index, setIndex] = useState(0)
  const track = useRef<HTMLDivElement>(null)
  const paused = useRef(false)

  useEffect(() => {
    createClient().rpc('get_store_banners', { p_establishment_id: establishmentId }).then(({ data: d, error }) => {
      if (!error && d) setData(d as Payload)
    }, () => {})
  }, [establishmentId])

  const slides = useMemo<Slide[]>(() => {
    if (!data) return []
    const byId = new Map(products.map((p) => [p.id, p]))
    return [
      ...data.banners.map((b) => ({ kind: 'manual' as const, key: `b-${b.id}`, banner: b })),
      ...data.coupons.map((c) => ({ kind: 'coupon' as const, key: `c-${c.code}`, coupon: c })),
      ...data.top_products
        .map((id, i) => ({ product: byId.get(id), rank: i + 1 }))
        .filter((x): x is { product: PublicProduct; rank: number } => !!x.product && x.product.in_stock)
        .map((x) => ({ kind: 'top' as const, key: `t-${x.product.id}`, product: x.product, rank: x.rank })),
    ]
  }, [data, products])

  // Passa sozinho a cada 5 s (pausa enquanto a pessoa mexe).
  useEffect(() => {
    if (slides.length < 2) return
    const t = setInterval(() => {
      if (paused.current || !track.current) return
      const next = (index + 1) % slides.length
      track.current.scrollTo({ left: next * track.current.clientWidth, behavior: 'smooth' })
    }, 5000)
    return () => clearInterval(t)
  }, [index, slides.length])

  if (slides.length === 0) return null

  const open = (s: Slide) => {
    if (s.kind === 'top') return onProduct(s.product)
    if (s.kind === 'coupon') return onCoupon(s.coupon.code)
    const { link_type, link_ref } = s.banner
    if (!link_ref) return
    if (link_type === 'produto') {
      const p = products.find((x) => x.id === link_ref)
      if (p) onProduct(p)
    } else if (link_type === 'combo') onCombo(link_ref)
    else if (link_type === 'categoria') onCategory(link_ref)
    else if (link_type === 'cupom') onCoupon(link_ref)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pt-3" aria-roledescription="carrossel" aria-label="Destaques da loja">
      <div
        ref={track}
        className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar rounded-2xl"
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
        onPointerDown={() => { paused.current = true }}
        onPointerUp={() => { setTimeout(() => { paused.current = false }, 4000) }}
      >
        {slides.map((s, i) => (
          <button
            key={s.key}
            type="button"
            onClick={() => open(s)}
            className="snap-center flex-shrink-0 w-full text-left"
            aria-label={`Destaque ${i + 1} de ${slides.length}`}
          >
            <div className="relative w-full aspect-[8/3] rounded-2xl overflow-hidden bg-primary-500">
              {s.kind === 'manual' && (
                <>
                  {s.banner.image_url && <SmartImage src={s.banner.image_url} alt={s.banner.title || 'Banner'} fill sizes="(max-width: 672px) 100vw, 640px" className="object-cover" priority={i === 0} />}
                  {!s.banner.image_url && (s.banner.title || s.banner.subtitle) && (
                    <div className="absolute inset-0 bg-gradient-to-br from-primary-500 to-primary-800 p-4 sm:p-6 flex flex-col justify-center text-white">
                      <p className="font-display text-xl sm:text-2xl font-extrabold leading-tight line-clamp-2">{s.banner.title}</p>
                      {s.banner.subtitle && <p className="text-sm text-white/90 mt-1 line-clamp-2">{s.banner.subtitle}</p>}
                    </div>
                  )}
                </>
              )}
              {s.kind === 'top' && (
                <div className="absolute inset-0 bg-gradient-to-r from-primary-700 to-primary-500 flex">
                  <div className="flex-1 min-w-0 p-4 sm:p-5 flex flex-col justify-center text-white">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide bg-white/20 rounded-full px-2 py-0.5 w-fit"><Flame size={12} /> {s.rank === 1 ? 'O mais pedido' : 'Mais pedido'}</span>
                    <p className="font-display text-lg sm:text-2xl font-extrabold leading-tight mt-1.5 line-clamp-2">{s.product.name}</p>
                    <p className="text-sm font-semibold mt-1">
                      {s.product.original_price ? <span className="line-through text-white/70 mr-1.5 font-normal">{formatBRL(Number(s.product.original_price))}</span> : null}
                      {formatBRL(Number(s.product.price))}
                    </p>
                  </div>
                  {s.product.image_url && (
                    <div className="relative w-[42%] flex-shrink-0">
                      <SmartImage src={s.product.image_url} alt={s.product.name} fill sizes="280px" className="object-cover" />
                    </div>
                  )}
                </div>
              )}
              {s.kind === 'coupon' && (
                <div className="absolute inset-0 bg-gradient-to-br from-amber-400 to-orange-500 p-4 sm:p-6 flex items-center gap-4 text-gray-900">
                  <Tag size={40} className="flex-shrink-0 opacity-80" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide">Cupom</p>
                    <p className="font-display text-2xl sm:text-3xl font-extrabold tracking-wide">{s.coupon.code}</p>
                    <p className="text-sm font-semibold">
                      {couponBenefit({ discount_type: s.coupon.discount_type, discount_value: Number(s.coupon.discount_value) })}
                      {s.coupon.expires_at ? ` · até ${new Date(s.coupon.expires_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}` : ''}
                    </p>
                    <p className="text-xs mt-0.5">Toque para usar no pedido</p>
                  </div>
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
      {slides.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2" aria-hidden="true">
          {slides.map((s, i) => <span key={s.key} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-primary-500' : 'w-1.5 bg-gray-300'}`} />)}
        </div>
      )}
    </div>
  )
}
