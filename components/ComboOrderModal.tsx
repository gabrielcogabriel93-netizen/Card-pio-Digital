'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buildComboOrderResult, comboPizzaFlavorLimit, type ComboOrderResult, type ComboSlotSelection } from '@/lib/combo'
import type { ComboGroup, PublicProduct } from '@/types'
import { Check, Loader2, X } from 'lucide-react'

export type { ComboOrderResult }

interface ComboOrderModalProps {
  comboId: string
  comboName: string
  comboImageUrl?: string | null
  comboPrice: number
  establishmentId: string
  onConfirm: (result: ComboOrderResult) => void
  onClose: () => void
}

interface SizeInfo { name: string; max_flavors: number }
interface Additional { id: string; name: string; prices: Record<string, number> }

/**
 * Fluxo de pedido de combo: um passo por grupo (ex: "Escolha o sabor",
 * "Escolha a sobremesa", "Escolha a bebida"), cada um com os produtos
 * elegíveis definidos pelo lojista. O preço é o fixo do combo; na pizza
 * do combo o cliente pode dividir sabores e pôr adicionais conforme as
 * regras daquela pizza (migration 050), e só os adicionais somam.
 * Lido só de tabelas públicas: funciona igual no cardápio e no balcão.
 */
export function ComboOrderModal({ comboId, comboName, comboImageUrl, comboPrice, establishmentId, onConfirm, onClose }: ComboOrderModalProps) {
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState<ComboGroup[]>([])
  const [productsByGroup, setProductsByGroup] = useState<Record<string, PublicProduct[]>>({})
  const [sizes, setSizes] = useState<Record<string, SizeInfo>>({})
  const [flavorCategory, setFlavorCategory] = useState<Record<string, string | null>>({})
  const [additionals, setAdditionals] = useState<Additional[]>([])
  // Escolhas por grupo, na ordem em que o cliente tocou (o 1º é o sabor principal).
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  const [addsByGroup, setAddsByGroup] = useState<Record<string, string[]>>({})
  const [attemptedConfirm, setAttemptedConfirm] = useState(false)

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const load = async () => {
    const supabase = createClient()
    const { data: groupsData, error: groupsError } = await supabase
      .from('combo_groups')
      .select('*')
      .eq('combo_id', comboId)
      .order('display_order')

    if (groupsError || !groupsData) {
      setLoading(false)
      return
    }

    const groupIds = groupsData.map((g) => g.id)
    const hasPizza = groupsData.some((g) => g.is_pizza_slot)
    const wantsAdditionals = groupsData.some((g) => g.is_pizza_slot && g.pizza_allow_additionals)
    const [linksRes, sizesRes, flavorsRes, addsRes] = await Promise.all([
      groupIds.length > 0
        ? supabase.from('combo_group_products').select('combo_group_id, product_id').in('combo_group_id', groupIds)
        : Promise.resolve({ data: [] as { combo_group_id: string; product_id: string }[] }),
      supabase.from('pizza_sizes').select('id, name, max_flavors').eq('establishment_id', establishmentId),
      hasPizza ? supabase.from('pizza_flavors').select('id, category').eq('establishment_id', establishmentId) : Promise.resolve({ data: [] as { id: string; category: string | null }[] }),
      wantsAdditionals
        ? supabase.from('pizza_additionals').select('id, name, display_order, pizza_additional_prices(size_id, price)').eq('establishment_id', establishmentId).eq('is_active', true).order('display_order')
        : Promise.resolve({ data: [] as any[] }),
    ])

    const links = linksRes.data || []
    const productIds = Array.from(new Set(links.map((l) => l.product_id)))

    let products: PublicProduct[] = []
    if (productIds.length > 0) {
      const { data } = await supabase.from('public_products').select('*').in('id', productIds)
      products = data || []
    }

    const byGroup: Record<string, PublicProduct[]> = {}
    for (const group of groupsData) {
      const idsInGroup = links.filter((l) => l.combo_group_id === group.id).map((l) => l.product_id)
      byGroup[group.id] = products.filter((p) => idsInGroup.includes(p.id))
    }

    const sizeMap: Record<string, SizeInfo> = {}
    for (const s of sizesRes.data || []) sizeMap[s.id] = { name: s.name, max_flavors: s.max_flavors || 1 }
    const cat: Record<string, string | null> = {}
    for (const f of flavorsRes.data || []) cat[f.id] = f.category
    const adds: Additional[] = (addsRes.data || []).map((a: any) => ({
      id: a.id,
      name: a.name,
      prices: Object.fromEntries((a.pizza_additional_prices || []).map((p: any) => [p.size_id, Number(p.price) || 0])),
    }))

    setGroups(groupsData)
    setProductsByGroup(byGroup)
    setSizes(sizeMap)
    setFlavorCategory(cat)
    setAdditionals(adds)
    setLoading(false)
  }

  const limitFor = (group: ComboGroup) =>
    group.is_pizza_slot ? comboPizzaFlavorLimit(group, group.fixed_pizza_size_id ? sizes[group.fixed_pizza_size_id]?.max_flavors : 1) : 1

  const categoryOf = (product: PublicProduct | undefined) => (product?.pizza_flavor_id ? flavorCategory[product.pizza_flavor_id] ?? null : null)

  const toggle = (group: ComboGroup, productId: string) => {
    const limit = limitFor(group)
    setPicked((prev) => {
      const current = prev[group.id] || []
      if (current.includes(productId)) return { ...prev, [group.id]: current.filter((id) => id !== productId) }
      if (limit === 1) return { ...prev, [group.id]: [productId] }
      if (current.length >= limit) return prev
      return { ...prev, [group.id]: [...current, productId] }
    })
  }

  const toggleAdd = (groupId: string, addId: string) => {
    setAddsByGroup((prev) => {
      const current = prev[groupId] || []
      return { ...prev, [groupId]: current.includes(addId) ? current.filter((id) => id !== addId) : [...current, addId] }
    })
  }

  const missingGroups = groups.filter((g) => !(picked[g.id] || []).length)

  const addPrice = (group: ComboGroup, add: Additional) => (group.fixed_pizza_size_id ? add.prices[group.fixed_pizza_size_id] || 0 : 0)
  const extrasTotal = groups.reduce((sum, g) => {
    if (!g.is_pizza_slot || !g.pizza_allow_additionals) return sum
    return sum + (addsByGroup[g.id] || []).reduce((s, id) => {
      const add = additionals.find((a) => a.id === id)
      return s + (add ? addPrice(g, add) : 0)
    }, 0)
  }, 0)
  const total = Number(comboPrice) + extrasTotal

  const handleConfirmClick = () => {
    if (missingGroups.length > 0) {
      setAttemptedConfirm(true)
      return
    }

    const slotSelections: ComboSlotSelection[] = groups.map((group) => {
      const products = productsByGroup[group.id] || []
      const [mainId, ...extraIds] = picked[group.id]
      const product = products.find((p) => p.id === mainId)!
      const extraFlavors = extraIds
        .map((id) => products.find((p) => p.id === id))
        .filter((p): p is PublicProduct => !!p)
        .map((p) => ({ id: p.id, name: p.name }))
      const chosenAdds = group.is_pizza_slot && group.pizza_allow_additionals
        ? (addsByGroup[group.id] || [])
            .map((id) => additionals.find((a) => a.id === id))
            .filter((a): a is Additional => !!a)
            .map((a) => ({ id: a.id, name: a.name, price: addPrice(group, a) }))
        : []
      return { group, product: { id: product.id, name: product.name }, extraFlavors, additionals: chosenAdds }
    })

    onConfirm(buildComboOrderResult({ id: comboId, price: comboPrice }, slotSelections))
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50" />
        <div className="relative bg-white rounded-xl p-6">
          <Loader2 size={24} className="animate-spin text-primary-500" />
        </div>
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6 text-center animate-fade-in">
          <p className="text-gray-700 mb-4">Esse combo ainda não está configurado. Fale com a loja.</p>
          <button onClick={onClose} className="btn-secondary w-full">Fechar</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto animate-slide-up sm:animate-fade-in">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-xl flex items-center justify-between z-10">
          <div className="flex items-center gap-3 min-w-0">
            {comboImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={comboImageUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
            )}
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 truncate">{comboName}</h2>
              <p className="text-sm text-gray-500">{formatCurrency(Number(comboPrice))}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded flex-shrink-0" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {groups.map((group) => {
            const products = productsByGroup[group.id] || []
            const chosen = picked[group.id] || []
            const limit = limitFor(group)
            const groupMissing = attemptedConfirm && chosen.length === 0
            const mainCategory = categoryOf(products.find((p) => p.id === chosen[0]))
            const size = group.fixed_pizza_size_id ? sizes[group.fixed_pizza_size_id] : null
            return (
              <div key={group.id} className={groupMissing ? 'border border-red-300 bg-red-50/50 rounded-lg p-3 -m-3' : ''}>
                <h3 className="font-medium text-gray-900 mb-1">{group.name}</h3>
                {group.is_pizza_slot && (
                  <p className="text-xs text-gray-500 mb-3">
                    {size ? `Tamanho ${size.name}` : 'Tamanho fixo'}
                    {' · '}
                    {limit > 1 ? `escolha até ${limit} sabores (o primeiro é o principal)` : 'um sabor'}
                  </p>
                )}
                {groupMissing && (
                  <p className="text-xs text-red-600 mb-2">Escolha uma opção para continuar.</p>
                )}
                {products.length === 0 ? (
                  <p className="text-sm text-gray-400">Nenhuma opção disponível no momento.</p>
                ) : (
                  <div className="space-y-2">
                    {products.map((product) => {
                      const order = chosen.indexOf(product.id)
                      const isSelected = order >= 0
                      // Meio a meio segue a regra da pizza avulsa: não mistura salgada com doce.
                      const mismatch = group.is_pizza_slot && !isSelected && chosen.length > 0 && limit > 1
                        && mainCategory !== null && categoryOf(product) !== null && categoryOf(product) !== mainCategory
                      const full = limit > 1 && !isSelected && chosen.length >= limit
                      const disabled = !product.in_stock || mismatch || full
                      return (
                        <button
                          key={product.id}
                          onClick={() => !disabled && toggle(group, product.id)}
                          disabled={disabled}
                          className={`w-full flex items-center justify-between gap-3 p-3 rounded-lg border-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                            isSelected ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                          }`}
                          aria-pressed={isSelected}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            {product.image_url && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={product.image_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                            )}
                            <span className="font-medium text-sm truncate">{product.name}</span>
                          </span>
                          {!product.in_stock ? (
                            <span className="text-xs text-gray-400 flex-shrink-0">Esgotado</span>
                          ) : isSelected && limit > 1 ? (
                            <span className="w-6 h-6 rounded-full bg-primary-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{order + 1}</span>
                          ) : isSelected ? (
                            <Check size={18} className="text-primary-600 flex-shrink-0" />
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                )}

                {group.is_pizza_slot && group.pizza_allow_additionals && additionals.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-medium text-gray-800 mb-2">Adicionais <span className="text-gray-400 font-normal">(opcional, cobrado à parte)</span></p>
                    <div className="space-y-2">
                      {additionals.map((add) => {
                        const on = (addsByGroup[group.id] || []).includes(add.id)
                        return (
                          <label key={add.id} className={`flex items-center justify-between gap-3 p-3 rounded-lg border-2 cursor-pointer ${on ? 'border-primary-500 bg-primary-50' : 'border-gray-200'}`}>
                            <span className="flex items-center gap-2 text-sm">
                              <input type="checkbox" className="rounded border-gray-300 text-primary-500" checked={on} onChange={() => toggleAdd(group.id, add.id)} />
                              {add.name}
                            </span>
                            <span className="text-sm text-gray-600">+ {formatCurrency(addPrice(group, add))}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4">
          {attemptedConfirm && missingGroups.length > 0 && (
            <p className="text-sm text-red-600 mb-3">
              Falta escolher: <strong>{missingGroups.map((g) => g.name).join(', ')}</strong>.
            </p>
          )}
          <button onClick={handleConfirmClick} className="btn-primary w-full">
            Adicionar ao Carrinho · {formatCurrency(total)}
          </button>
        </div>
      </div>
    </div>
  )
}
