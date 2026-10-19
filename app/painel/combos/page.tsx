'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { log, logError } from '@/lib/logger'
import { ImageUpload } from '@/components/ImageUpload'
import { useEscapeKey } from '@/lib/useEscapeKey'
import { formatBRL } from '@/lib/money'
import type { Combo, Product, PizzaSize } from '@/types'
import { toast, confirmDialog } from '@/components/Feedback'
import {
  Plus, Edit2, Trash2, ChevronDown, ChevronUp, X, Loader2, ToggleLeft, ToggleRight, Layers, Package, Pizza, Search, CheckSquare,
} from 'lucide-react'

type PartKind = 'produto' | 'pizza'

interface DraftPart {
  key: string
  id?: string
  name: string
  kind: PartKind
  sizeId: string
  maxFlavors: number
  allowAdditionals: boolean
  productIds: string[]
  search: string
}

interface Draft {
  id?: string
  name: string
  description: string
  image_url: string
  price: string
  is_active: boolean
  parts: DraftPart[]
}

const FLAVOR_OPTIONS = [
  { n: 1, label: 'Só 1 sabor' },
  { n: 2, label: 'Meio a meio' },
  { n: 3, label: 'Até 3 sabores' },
  { n: 4, label: 'Até 4 sabores' },
]

const newKey = () => Math.random().toString(36).slice(2)
const emptyDraft = (): Draft => ({ name: '', description: '', image_url: '', price: '', is_active: true, parts: [] })

export default function CombosPage() {
  const [combos, setCombos] = useState<Combo[]>([])
  const [establishmentId, setEstablishmentId] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [sizes, setSizes] = useState<PizzaSize[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loadingDraft, setLoadingDraft] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tried, setTried] = useState(false)

  useEscapeKey(() => setDraft(null), !!draft)

  const flavors = useMemo(() => products.filter((p) => !!p.pizza_flavor_id), [products])
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const loadData = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: est } = await supabase.from('establishments').select('id').eq('owner_id', user.id).single()
      if (!est) return
      setEstablishmentId(est.id)
      const [combosRes, productsRes, sizesRes] = await Promise.all([
        supabase.from('combos').select('*').eq('establishment_id', est.id).order('display_order'),
        supabase.from('products').select('*').eq('establishment_id', est.id).eq('is_active', true).order('name'),
        supabase.from('pizza_sizes').select('*').eq('establishment_id', est.id).eq('is_active', true).order('display_order'),
      ])
      if (combosRes.error) logError('painel:combos', 'erro ao carregar combos', combosRes.error)
      setCombos(combosRes.data || [])
      setProducts(productsRes.data || [])
      setSizes(sizesRes.data || [])
    } catch (error) {
      logError('painel:combos', 'exceção ao carregar dados', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // ---------- Editor ----------
  const openNew = () => {
    setTried(false)
    setDraft({ ...emptyDraft(), parts: [newPart(sizes.length > 0 ? 'pizza' : 'produto')] })
  }

  function newPart(kind: PartKind): DraftPart {
    const size = sizes[0]
    return {
      key: newKey(),
      name: kind === 'pizza' ? `Pizza ${size?.name ? size.name.toLowerCase().split(' ')[0] : ''}`.trim() : 'Bebida',
      kind,
      sizeId: kind === 'pizza' ? size?.id || '' : '',
      maxFlavors: kind === 'pizza' ? Math.min(4, size?.max_flavors || 1) : 1,
      allowAdditionals: false,
      productIds: [],
      search: '',
    }
  }

  const openEdit = async (combo: Combo) => {
    setTried(false)
    setLoadingDraft(true)
    setDraft({ id: combo.id, name: combo.name, description: combo.description || '', image_url: combo.image_url || '', price: String(combo.price), is_active: combo.is_active, parts: [] })
    try {
      const supabase = createClient()
      const { data: groups, error } = await supabase.from('combo_groups').select('*, combo_group_products(product_id)').eq('combo_id', combo.id).order('display_order')
      if (error) throw error
      setDraft((d) => d && {
        ...d,
        parts: (groups || []).map((g: any) => ({
          key: newKey(),
          id: g.id,
          name: g.name,
          kind: g.is_pizza_slot ? 'pizza' : 'produto',
          sizeId: g.fixed_pizza_size_id || '',
          maxFlavors: g.pizza_max_flavors || sizes.find((s) => s.id === g.fixed_pizza_size_id)?.max_flavors || 1,
          allowAdditionals: !!g.pizza_allow_additionals,
          productIds: (g.combo_group_products || []).map((l: any) => l.product_id),
          search: '',
        })),
      })
    } catch (err: any) {
      logError('painel:combos', 'erro ao carregar combo', err)
      toast.error('Não foi possível abrir o combo: ' + err.message)
      setDraft(null)
    } finally {
      setLoadingDraft(false)
    }
  }

  const updatePart = (key: string, changes: Partial<DraftPart>) =>
    setDraft((d) => d && { ...d, parts: d.parts.map((p) => (p.key === key ? { ...p, ...changes } : p)) })

  const movePart = (index: number, dir: -1 | 1) =>
    setDraft((d) => {
      if (!d) return d
      const parts = [...d.parts]
      const j = index + dir
      if (j < 0 || j >= parts.length) return d
      ;[parts[index], parts[j]] = [parts[j], parts[index]]
      return { ...d, parts }
    })

  const removePart = (key: string) => setDraft((d) => d && { ...d, parts: d.parts.filter((p) => p.key !== key) })

  const toggleProduct = (part: DraftPart, productId: string) =>
    updatePart(part.key, { productIds: part.productIds.includes(productId) ? part.productIds.filter((id) => id !== productId) : [...part.productIds, productId] })

  // Problemas que impedem salvar (sempre) ou deixar disponível.
  const problems = useMemo(() => {
    if (!draft) return [] as string[]
    const list: string[] = []
    if (!draft.name.trim()) list.push('Dê um nome ao combo.')
    if (draft.price.trim() === '' || Number(draft.price.replace(',', '.')) < 0) list.push('Informe o preço do combo.')
    draft.parts.forEach((p, i) => {
      const label = p.name.trim() || `Parte ${i + 1}`
      if (!p.name.trim()) list.push(`Dê um nome à parte ${i + 1}.`)
      if (p.kind === 'pizza' && !p.sizeId) list.push(`Escolha o tamanho da pizza em "${label}".`)
      if (draft.is_active && p.productIds.length === 0) list.push(`Marque pelo menos uma opção em "${label}".`)
    })
    if (draft.is_active && draft.parts.length === 0) list.push('Adicione pelo menos uma parte ao combo.')
    return list
  }, [draft])

  const save = async () => {
    if (!draft) return
    setTried(true)
    if (problems.length > 0) {
      toast(problems[0])
      return
    }
    setSaving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.rpc('save_combo', {
        p_payload: {
          id: draft.id || null,
          name: draft.name.trim(),
          description: draft.description.trim(),
          image_url: draft.image_url || null,
          price: Number(draft.price.replace(',', '.')),
          is_active: draft.is_active,
          groups: draft.parts.map((p) => ({
            id: p.id || null,
            name: p.name.trim(),
            is_pizza_slot: p.kind === 'pizza',
            fixed_pizza_size_id: p.kind === 'pizza' ? p.sizeId : null,
            pizza_max_flavors: p.kind === 'pizza' ? p.maxFlavors : null,
            pizza_allow_additionals: p.kind === 'pizza' && p.allowAdditionals,
            product_ids: p.productIds,
          })),
        },
      })
      if (error) {
        // Banco ainda sem a migration 052 (save_combo): avisa em vez de erro técnico.
        if (error.code === 'PGRST202' || /save_combo/.test(error.message)) {
          throw new Error('O cadastro novo de combos ainda está sendo ativado. Tente de novo em alguns minutos.')
        }
        throw error
      }
      log('painel:combos', 'combo salvo')
      toast.success(draft.is_active ? 'Combo salvo e disponível no cardápio' : 'Combo salvo (ainda indisponível para os clientes)')
      setDraft(null)
      await loadData()
    } catch (err: any) {
      logError('painel:combos', 'erro ao salvar combo', err)
      toast.error(err.message || 'Não foi possível salvar o combo.')
    } finally {
      setSaving(false)
    }
  }

  // ---------- Lista ----------
  const handleDeleteCombo = async (combo: Combo) => {
    if (!(await confirmDialog(`Excluir o combo "${combo.name}"?`))) return
    const { error } = await createClient().from('combos').delete().eq('id', combo.id)
    if (error) {
      logError('painel:combos', 'erro ao excluir combo', error)
      toast.error('Erro ao excluir combo: ' + error.message)
      return
    }
    await loadData()
  }

  // Ligar/desligar direto do cartão. Ligar confere se está completo.
  const toggleActive = async (combo: Combo) => {
    const supabase = createClient()
    if (!combo.is_active) {
      const { data: groups } = await supabase.from('combo_groups').select('name, is_pizza_slot, fixed_pizza_size_id, combo_group_products(count)').eq('combo_id', combo.id)
      if (!groups || groups.length === 0) {
        toast('Abra o combo e adicione o que vem nele antes de deixá-lo disponível.')
        return
      }
      const empty = (groups as any[]).find((g) => (g.combo_group_products?.[0]?.count ?? 0) === 0 || (g.is_pizza_slot && !g.fixed_pizza_size_id))
      if (empty) {
        toast(`Complete "${empty.name}" antes de deixar o combo disponível.`)
        return
      }
    }
    const { error } = await supabase.from('combos').update({ is_active: !combo.is_active }).eq('id', combo.id)
    if (error) {
      toast.error('Erro ao alterar: ' + error.message)
      return
    }
    await loadData()
  }

  const moveCombo = async (index: number, direction: -1 | 1) => {
    const j = index + direction
    if (j < 0 || j >= combos.length) return
    const updated = [...combos]
    ;[updated[index], updated[j]] = [updated[j], updated[index]]
    setCombos(updated)
    const supabase = createClient()
    await Promise.all(updated.map((c, i) => supabase.from('combos').update({ display_order: i }).eq('id', c.id)))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary-500" />
      </div>
    )
  }

  const partSummary = (p: DraftPart) => {
    const n = p.productIds.length
    if (p.kind === 'pizza') {
      const size = sizes.find((s) => s.id === p.sizeId)
      const rule = FLAVOR_OPTIONS.find((o) => o.n === p.maxFlavors)?.label.toLowerCase() || ''
      return `${size?.name || 'pizza'} · ${rule} · ${n} sabor${n === 1 ? '' : 'es'}`
    }
    return `${n} opç${n === 1 ? 'ão' : 'ões'}`
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Combos</h1>
          <p className="text-gray-600 mt-1">Monte kits com preço fixo: pizza (inclusive meio a meio), lanche, bebida, sobremesa.</p>
        </div>
        <button onClick={openNew} className="btn-primary">
          <Plus size={18} /> Novo combo
        </button>
      </div>

      {combos.length === 0 ? (
        <div className="card text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Layers size={32} className="text-gray-400" />
          </div>
          <p className="text-gray-700 font-medium">Nenhum combo ainda</p>
          <p className="text-sm text-gray-500 mt-1 mb-4 max-w-md mx-auto">
            Exemplo: &quot;Pizza grande meio a meio + refrigerante 2L por R$ 69,90&quot;. Você monta tudo numa tela só.
          </p>
          <button onClick={openNew} className="btn-primary inline-flex"><Plus size={18} /> Criar primeiro combo</button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {combos.map((combo, index) => (
            <div key={combo.id} className="card">
              <div className="flex items-start justify-between gap-3 mb-3">
                <button onClick={() => openEdit(combo)} className="flex items-center gap-3 min-w-0 text-left">
                  {combo.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={combo.image_url} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <Package size={20} className="text-gray-400" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{combo.name}</p>
                    <p className="text-primary-600 font-medium">{formatBRL(Number(combo.price))}</p>
                  </div>
                </button>
                <span className={`text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ${combo.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {combo.is_active ? 'Disponível' : 'Indisponível'}
                </span>
              </div>
              {combo.description && <p className="text-sm text-gray-500 mb-3 line-clamp-2">{combo.description}</p>}
              <div className="flex items-center gap-1 justify-end">
                <button onClick={() => moveCombo(index, -1)} disabled={index === 0} className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30" aria-label="Mover para cima"><ChevronUp size={16} /></button>
                <button onClick={() => moveCombo(index, 1)} disabled={index === combos.length - 1} className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30" aria-label="Mover para baixo"><ChevronDown size={16} /></button>
                <button onClick={() => toggleActive(combo)} className="p-1.5 hover:bg-gray-100 rounded" aria-label={combo.is_active ? 'Deixar indisponível' : 'Deixar disponível'}>
                  {combo.is_active ? <ToggleRight size={20} className="text-green-600" /> : <ToggleLeft size={20} className="text-gray-400" />}
                </button>
                <button onClick={() => openEdit(combo)} className="p-1.5 hover:bg-gray-100 rounded" aria-label="Editar"><Edit2 size={16} className="text-gray-500" /></button>
                <button onClick={() => handleDeleteCombo(combo)} className="p-1.5 hover:bg-red-50 rounded" aria-label="Excluir"><Trash2 size={16} className="text-red-400" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {draft && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="combo-title">
          <div className="fixed inset-0 bg-black/50" onClick={() => setDraft(null)} />
          <div className="relative bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl shadow-xl max-h-[94vh] flex flex-col animate-slide-up sm:animate-fade-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 id="combo-title" className="font-display text-lg font-extrabold text-gray-900">{draft.id ? 'Editar combo' : 'Novo combo'}</h2>
              <button onClick={() => setDraft(null)} className="p-1 hover:bg-gray-100 rounded" aria-label="Fechar"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
              {/* 1. Dados */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">1. Dados do combo</h3>
                <div className="grid sm:grid-cols-[1fr_140px] gap-3">
                  <div>
                    <label htmlFor="c-name" className="block text-sm text-gray-700 mb-1">Nome</label>
                    <input id="c-name" className={`input-field ${tried && !draft.name.trim() ? 'border-red-400' : ''}`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ex: Pizza grande + Refri 2L" />
                  </div>
                  <div>
                    <label htmlFor="c-price" className="block text-sm text-gray-700 mb-1">Preço (R$)</label>
                    <input id="c-price" inputMode="decimal" className={`input-field ${tried && draft.price.trim() === '' ? 'border-red-400' : ''}`} value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value.replace(/[^\d,.]/g, '') })} placeholder="69,90" />
                  </div>
                </div>
                <div>
                  <label htmlFor="c-desc" className="block text-sm text-gray-700 mb-1">Descrição <span className="text-gray-400">(opcional)</span></label>
                  <textarea id="c-desc" className="input-field" rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Ex: 1 pizza grande (pode ser meio a meio) + 1 refrigerante 2L" />
                </div>
                <ImageUpload value={draft.image_url} onChange={(url) => setDraft({ ...draft, image_url: url })} establishmentId={establishmentId} folder="combos" label="Foto do combo (opcional)" />
              </section>

              {/* 2. Partes */}
              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">2. O que vem no combo</h3>
                  <p className="text-xs text-gray-500">Cada parte é uma escolha do cliente. Na pizza, você decide o tamanho, quantos sabores e quais valem.</p>
                </div>

                {loadingDraft ? (
                  <div className="flex justify-center py-6"><Loader2 className="animate-spin text-primary-500" /></div>
                ) : (
                  draft.parts.map((part, i) => {
                    const list = part.kind === 'pizza' ? flavors : products
                    const q = part.search.trim().toLowerCase()
                    const visible = q ? list.filter((p) => p.name.toLowerCase().includes(q)) : list
                    const allMarked = visible.length > 0 && visible.every((p) => part.productIds.includes(p.id))
                    const pizzaInProductPart = part.kind === 'produto' && part.productIds.some((id) => productById.get(id)?.pizza_flavor_id)
                    const missing = tried && draft.is_active && part.productIds.length === 0
                    return (
                      <div key={part.key} className={`rounded-xl border p-3 space-y-3 ${missing ? 'border-red-300 bg-red-50/40' : 'border-gray-200'}`}>
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-primary-50 text-primary-700 text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                          <input className="input-field py-1.5 text-sm flex-1" value={part.name} onChange={(e) => updatePart(part.key, { name: e.target.value })} placeholder="Nome da parte (ex: Pizza grande)" aria-label={`Nome da parte ${i + 1}`} />
                          <button type="button" onClick={() => movePart(i, -1)} disabled={i === 0} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30" aria-label="Subir"><ChevronUp size={16} /></button>
                          <button type="button" onClick={() => movePart(i, 1)} disabled={i === draft.parts.length - 1} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30" aria-label="Descer"><ChevronDown size={16} /></button>
                          <button type="button" onClick={() => removePart(part.key)} className="p-1 rounded hover:bg-red-50" aria-label="Remover parte"><Trash2 size={15} className="text-red-400" /></button>
                        </div>

                        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo da parte">
                          {([['produto', 'Produto', Package], ['pizza', 'Pizza', Pizza]] as const).map(([kind, label, Icon]) => (
                            <button
                              key={kind}
                              type="button"
                              role="radio"
                              aria-checked={part.kind === kind}
                              disabled={kind === 'pizza' && sizes.length === 0}
                              onClick={() => {
                                if (part.kind === kind) return
                                const size = sizes[0]
                                updatePart(part.key, kind === 'pizza'
                                  ? { kind, sizeId: part.sizeId || size?.id || '', maxFlavors: Math.min(4, size?.max_flavors || 1), productIds: part.productIds.filter((id) => productById.get(id)?.pizza_flavor_id) }
                                  : { kind })
                              }}
                              className={`flex items-center justify-center gap-2 rounded-lg border-2 py-2 text-sm font-medium disabled:opacity-40 ${part.kind === kind ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600'}`}
                            >
                              <Icon size={16} /> {label}
                            </button>
                          ))}
                        </div>
                        {sizes.length === 0 && part.kind === 'produto' && (
                          <p className="text-[11px] text-gray-500">Para usar pizza com tamanhos e sabores, cadastre os tamanhos em Pizzas.</p>
                        )}

                        {part.kind === 'pizza' && (
                          <div className="space-y-3 rounded-lg bg-gray-50 p-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Tamanho</label>
                              <select
                                className={`input-field text-sm py-2 ${tried && !part.sizeId ? 'border-red-400' : ''}`}
                                value={part.sizeId}
                                onChange={(e) => {
                                  const size = sizes.find((s) => s.id === e.target.value)
                                  updatePart(part.key, { sizeId: e.target.value, maxFlavors: Math.min(4, size?.max_flavors || part.maxFlavors) })
                                }}
                              >
                                <option value="">Escolha o tamanho</option>
                                {sizes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-gray-700 mb-1">Sabores por pizza</p>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Sabores por pizza">
                                {FLAVOR_OPTIONS.map((o) => (
                                  <button
                                    key={o.n}
                                    type="button"
                                    role="radio"
                                    aria-checked={part.maxFlavors === o.n}
                                    onClick={() => updatePart(part.key, { maxFlavors: o.n })}
                                    className={`rounded-lg border-2 py-2 text-xs font-semibold ${part.maxFlavors === o.n ? 'border-primary-500 bg-white text-primary-700' : 'border-gray-200 bg-white text-gray-600'}`}
                                  >
                                    {o.label}
                                  </button>
                                ))}
                              </div>
                              <p className="text-[11px] text-gray-500 mt-1">Promoção de um sabor só? Escolha &quot;Só 1 sabor&quot; e marque apenas ele abaixo.</p>
                            </div>
                            <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                              <input type="checkbox" checked={part.allowAdditionals} onChange={(e) => updatePart(part.key, { allowAdditionals: e.target.checked })} className="rounded border-gray-300 text-primary-500" />
                              Aceitar adicionais (borda etc.), cobrados à parte pelo preço do tamanho
                            </label>
                          </div>
                        )}

                        <div>
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <p className="text-xs font-medium text-gray-700">
                              {part.kind === 'pizza' ? 'Sabores que valem' : 'Opções para o cliente escolher'} · <span className={part.productIds.length ? 'text-primary-700' : 'text-gray-400'}>{part.productIds.length} marcad{part.productIds.length === 1 ? 'a' : 'as'}</span>
                            </p>
                            {visible.length > 0 && (
                              <button
                                type="button"
                                onClick={() => updatePart(part.key, {
                                  productIds: allMarked
                                    ? part.productIds.filter((id) => !visible.some((p) => p.id === id))
                                    : Array.from(new Set([...part.productIds, ...visible.map((p) => p.id)])),
                                })}
                                className="text-xs text-primary-700 font-medium inline-flex items-center gap-1"
                              >
                                <CheckSquare size={13} /> {allMarked ? 'Desmarcar todos' : 'Marcar todos'}
                              </button>
                            )}
                          </div>
                          {list.length > 8 && (
                            <div className="relative mb-2">
                              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                              <input className="input-field text-sm py-1.5 pl-8" value={part.search} onChange={(e) => updatePart(part.key, { search: e.target.value })} placeholder="Buscar" aria-label="Buscar opção" />
                            </div>
                          )}
                          {list.length === 0 ? (
                            <p className="text-xs text-gray-400">{part.kind === 'pizza' ? 'Nenhum sabor de pizza cadastrado ainda (em Pizzas).' : 'Nenhum produto ativo no cardápio ainda.'}</p>
                          ) : (
                            <div className="max-h-52 overflow-y-auto grid sm:grid-cols-2 gap-x-3">
                              {visible.map((p) => (
                                <label key={p.id} className="flex items-center gap-2 px-1 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-sm text-gray-700">
                                  <input type="checkbox" checked={part.productIds.includes(p.id)} onChange={() => toggleProduct(part, p.id)} className="rounded border-gray-300 text-primary-500" />
                                  <span className="truncate">{p.name}</span>
                                </label>
                              ))}
                            </div>
                          )}
                          {pizzaInProductPart && (
                            <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1 mt-2">
                              Há pizzas marcadas aqui. Troque o tipo para &quot;Pizza&quot; para escolher o tamanho e liberar meio a meio.
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setDraft({ ...draft, parts: [...draft.parts, newPart('pizza')] })} disabled={sizes.length === 0} className="btn-secondary text-sm"><Pizza size={16} /> Adicionar pizza</button>
                  <button type="button" onClick={() => setDraft({ ...draft, parts: [...draft.parts, newPart('produto')] })} className="btn-secondary text-sm"><Package size={16} /> Adicionar produto</button>
                </div>

                {draft.parts.length > 0 && (
                  <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2.5">
                    <strong>O cliente vai escolher:</strong> {draft.parts.map((p) => `${p.name || 'parte'} (${partSummary(p)})`).join(' + ')}
                  </p>
                )}
              </section>
            </div>

            <div className="border-t border-gray-100 px-5 py-3 space-y-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
              {tried && problems.length > 0 && <p className="text-xs text-red-600">{problems[0]}</p>}
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={draft.is_active}
                    onClick={() => setDraft({ ...draft, is_active: !draft.is_active })}
                    className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${draft.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${draft.is_active ? 'translate-x-5' : ''}`} />
                  </button>
                  Disponível para os clientes
                </label>
                <button type="button" onClick={save} disabled={saving || loadingDraft} className="btn-primary">
                  {saving ? <Loader2 size={18} className="animate-spin" /> : 'Salvar combo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
