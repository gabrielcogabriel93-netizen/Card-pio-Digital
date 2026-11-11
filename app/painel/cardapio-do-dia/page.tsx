'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { logError } from '@/lib/logger'
import { formatBRL } from '@/lib/money'
import { endOfTodayIso, isSoldOut } from '@/lib/soldOut'
import { WEEKDAY_LONG, WEEKDAY_SHORT, weekdayIn, servedToday, weekdaysLabel } from '@/lib/weekdays'
import { toast } from '@/components/Feedback'
import { SmartImage } from '@/components/SmartImage'
import type { Category, Product, VariationGroup, VariationOption } from '@/types'
import { CalendarDays, Loader2, RotateCcw, UtensilsCrossed } from 'lucide-react'

type Group = VariationGroup & { options: VariationOption[] }

/**
 * Cardápio do dia: o que tem e o que acabou hoje, em uma tela só.
 * - Pratos: "tem hoje" / "acabou hoje" e em que dias da semana saem.
 * - Opções: acompanhamentos, saladas, carnes... marcadas de uma vez em
 *   todos os pratos que têm a mesma opção.
 * Tudo o que acabou volta sozinho à meia-noite.
 */
export default function CardapioDoDiaPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [timezone, setTimezone] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: est } = await supabase.from('establishments').select('id, timezone').eq('owner_id', user.id).single()
      if (!est) return
      setTimezone(est.timezone || null)
      const [{ data: prods }, { data: cats }] = await Promise.all([
        supabase.from('products').select('*').eq('establishment_id', est.id).order('display_order'),
        supabase.from('categories').select('*').eq('establishment_id', est.id).order('display_order'),
      ])
      setProducts((prods || []) as Product[])
      setCategories((cats || []) as Category[])
      const ids = (prods || []).filter((p) => !p.pizza_flavor_id).map((p) => p.id)
      const all: Group[] = []
      for (let i = 0; i < ids.length; i += 100) {
        const { data } = await supabase.from('variation_groups').select('*, options:variation_options(*)').in('product_id', ids.slice(i, i + 100))
        all.push(...((data || []) as Group[]))
      }
      setGroups(all)
    } catch (err) {
      logError('painel:cardapio-do-dia', 'erro ao carregar', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const today = weekdayIn(timezone)

  // Opções iguais (mesmo grupo e mesmo nome) em vários pratos viram uma só.
  const optionBoard = useMemo(() => {
    const byGroup = new Map<string, { title: string; items: Map<string, { name: string; ids: string[]; soldOut: number; products: Set<string> }> }>()
    for (const g of groups) {
      const gk = g.name.trim().toLowerCase()
      const entry = byGroup.get(gk) || byGroup.set(gk, { title: g.name.trim(), items: new Map() }).get(gk)!
      for (const o of g.options || []) {
        const ok = o.name.trim().toLowerCase()
        const item = entry.items.get(ok) || entry.items.set(ok, { name: o.name.trim(), ids: [], soldOut: 0, products: new Set() }).get(ok)!
        item.ids.push(o.id)
        item.products.add(g.product_id)
        if (isSoldOut(o.sold_out_until)) item.soldOut++
      }
    }
    return Array.from(byGroup.values()).filter((g) => g.items.size > 0)
  }, [groups])

  const setOption = async (key: string, ids: string[], soldOut: boolean) => {
    setBusy(key)
    const until = soldOut ? endOfTodayIso(timezone || undefined) : null
    const { error } = await createClient().from('variation_options').update({ sold_out_until: until }).in('id', ids)
    setBusy(null)
    if (error) {
      toast.error(/sold_out_until/.test(error.message) ? 'Atualização do banco pendente (migration 060).' : 'Erro: ' + error.message)
      return
    }
    setGroups((prev) => prev.map((g) => ({ ...g, options: g.options.map((o) => (ids.includes(o.id) ? { ...o, sold_out_until: until } : o)) })))
  }

  const setProduct = async (p: Product, patch: Partial<Product>) => {
    setBusy(p.id)
    const { error } = await createClient().from('products').update(patch).eq('id', p.id)
    setBusy(null)
    if (error) {
      toast.error(/available_weekdays/.test(error.message) ? 'Atualização do banco pendente (migration 060).' : 'Erro: ' + error.message)
      return
    }
    setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...patch } : x)))
  }

  const toggleDay = (p: Product, day: number) => {
    const current = p.available_weekdays && p.available_weekdays.length ? p.available_weekdays : [0, 1, 2, 3, 4, 5, 6]
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort()
    if (next.length === 0) {
      toast('Deixe pelo menos um dia. Para tirar o prato do cardápio, desative em Produtos.')
      return
    }
    setProduct(p, { available_weekdays: next.length === 7 ? null : next })
  }

  const resetAll = async () => {
    const soldIds = groups.flatMap((g) => g.options.filter((o) => isSoldOut(o.sold_out_until)).map((o) => o.id))
    const soldProducts = products.filter((p) => isSoldOut(p.sold_out_until))
    const supabase = createClient()
    if (soldIds.length) await supabase.from('variation_options').update({ sold_out_until: null }).in('id', soldIds)
    if (soldProducts.length) await supabase.from('products').update({ sold_out_until: null }).in('id', soldProducts.map((p) => p.id))
    toast.success('Tudo disponível de novo.')
    load()
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary-500" /></div>

  const active = products.filter((p) => p.is_active)
  const byCategory = [
    ...categories.map((c) => ({ id: c.id, name: c.name, items: active.filter((p) => p.category_id === c.id) })),
    { id: 'sem', name: 'Sem categoria', items: active.filter((p) => !p.category_id || !categories.some((c) => c.id === p.category_id)) },
  ].filter((c) => c.items.length > 0)
  const anySoldOut = products.some((p) => isSoldOut(p.sold_out_until)) || groups.some((g) => g.options.some((o) => isSoldOut(o.sold_out_until)))

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2"><CalendarDays size={24} className="text-primary-600" /> Cardápio do dia</h1>
          <p className="text-gray-600 mt-1">Hoje é <strong>{WEEKDAY_LONG[today]}</strong>. Marque o que acabou: some do cardápio na hora e <strong>volta sozinho à meia-noite</strong>.</p>
        </div>
        {anySoldOut && <button onClick={resetAll} className="btn-secondary text-sm"><RotateCcw size={15} /> Repor tudo agora</button>}
      </div>

      <section className="card space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Opções de hoje</h2>
          <p className="text-sm text-gray-500">Toque para marcar o que acabou. Vale para todos os pratos que têm a opção (ex.: acabou o feijão em todas as marmitas).</p>
        </div>
        {optionBoard.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum prato com opções ainda. Cadastre em <Link href="/painel/produtos" className="text-primary-600 underline">Produtos</Link> (ex.: Acompanhamentos, Salada, Carne).</p>
        ) : optionBoard.map((g) => (
          <div key={g.title}>
            <p className="text-sm font-semibold text-gray-800 mb-2">{g.title}</p>
            <div className="flex flex-wrap gap-2">
              {Array.from(g.items.values()).map((item) => {
                const key = `${g.title}:${item.name}`
                const allOut = item.soldOut === item.ids.length
                return (
                  <button
                    key={key}
                    onClick={() => setOption(key, item.ids, !allOut)}
                    disabled={busy === key}
                    className={`px-3 py-2 rounded-xl border-2 text-sm font-medium transition-colors ${allOut ? 'border-gray-200 bg-gray-100 text-gray-400 line-through' : 'border-green-300 bg-green-50 text-green-800'}`}
                    aria-pressed={!allOut}
                    title={`${item.products.size} prato(s)`}
                  >
                    {busy === key ? <Loader2 size={14} className="animate-spin inline" /> : item.name}
                    <span className="ml-1.5 text-[11px] font-normal">{allOut ? 'acabou' : item.soldOut > 0 ? `acabou em ${item.soldOut}` : 'tem'}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="card space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Pratos</h2>
          <p className="text-sm text-gray-500">“Acabou hoje” tira o prato até a meia-noite. Os dias marcados dizem quando ele sai (ex.: feijoada só no sábado); nos outros dias aparece “Hoje não tem”.</p>
        </div>
        {byCategory.length === 0 && <p className="text-sm text-gray-500 flex items-center gap-2"><UtensilsCrossed size={16} /> Nenhum produto ativo.</p>}
        {byCategory.map((c) => (
          <div key={c.id} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{c.name}</p>
            {c.items.map((p) => {
              const out = isSoldOut(p.sold_out_until)
              const todayOk = servedToday(p.available_weekdays, timezone)
              const days = p.available_weekdays && p.available_weekdays.length ? p.available_weekdays : [0, 1, 2, 3, 4, 5, 6]
              return (
                <div key={p.id} className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border p-3 ${out || !todayOk ? 'border-gray-200 bg-gray-50' : 'border-gray-100'}`}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                      {p.image_url && <SmartImage src={p.image_url} alt="" fill sizes="56px" className="object-cover" />}
                    </div>
                    <div className="min-w-0">
                      <p className={`font-medium truncate ${out || !todayOk ? 'text-gray-500' : 'text-gray-900'}`}>{p.name}</p>
                      <p className="text-xs text-gray-500">{formatBRL(Number(p.price))} · sai {weekdaysLabel(p.available_weekdays)}{!todayOk ? ' · hoje não tem' : ''}</p>
                    </div>
                  </div>
                  <div className="flex gap-1" role="group" aria-label={`Dias de ${p.name}`}>
                    {WEEKDAY_SHORT.map((label, d) => (
                      <button
                        key={d}
                        onClick={() => toggleDay(p, d)}
                        disabled={busy === p.id}
                        aria-pressed={days.includes(d)}
                        className={`w-9 h-8 rounded-lg text-[11px] font-semibold ${days.includes(d) ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-400'} ${d === today ? 'ring-2 ring-offset-1 ring-primary-300' : ''}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setProduct(p, { sold_out_until: out ? null : endOfTodayIso(timezone || undefined) })}
                    disabled={busy === p.id || !todayOk}
                    className={`text-sm font-semibold px-3 py-2 rounded-xl min-w-[120px] ${out ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'} disabled:opacity-50`}
                  >
                    {out ? 'Acabou hoje' : 'Tem hoje'}
                  </button>
                </div>
              )
            })}
          </div>
        ))}
      </section>
    </div>
  )
}
