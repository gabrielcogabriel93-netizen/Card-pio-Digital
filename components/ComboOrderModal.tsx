'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buildComboOrderResult, type ComboOrderResult, type ComboSlotSelection } from '@/lib/combo'
import type { ComboGroup, PizzaSize, PublicProduct } from '@/types'
import { Loader2, X } from 'lucide-react'

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

/**
 * Fluxo de pedido de combo: um passo por grupo (ex: "Escolha o sabor",
 * "Escolha a sobremesa", "Escolha a bebida"), cada um com os produtos
 * elegíveis definidos pelo lojista. Preço é sempre o fixo do combo --
 * nenhuma escolha muda o total. Autocontido como PizzaOrderModal e lido
 * só de `public_products` (liberado pra anon e authenticated), então
 * funciona igual no cardápio público e no balcão sem bifurcação.
 */
export function ComboOrderModal({ comboId, comboName, comboImageUrl, comboPrice, establishmentId, onConfirm, onClose }: ComboOrderModalProps) {
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState<ComboGroup[]>([])
  const [productsByGroup, setProductsByGroup] = useState<Record<string, PublicProduct[]>>({})
  const [sizeNameById, setSizeNameById] = useState<Record<string, string>>({})
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, string>>({})
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
    const [linksRes, sizesRes] = await Promise.all([
      groupIds.length > 0
        ? supabase.from('combo_group_products').select('combo_group_id, product_id').in('combo_group_id', groupIds)
        : Promise.resolve({ data: [] as { combo_group_id: string; product_id: string }[] }),
      supabase.from('pizza_sizes').select('id, name').eq('establishment_id', establishmentId),
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

    const sizeNames: Record<string, string> = {}
    for (const size of sizesRes.data || []) sizeNames[size.id] = size.name

    setGroups(groupsData)
    setProductsByGroup(byGroup)
    setSizeNameById(sizeNames)
    setLoading(false)
  }

  const selectProduct = (groupId: string, productId: string) => {
    setSelectedByGroup((prev) => ({ ...prev, [groupId]: productId }))
  }

  const missingGroups = groups.filter((g) => !selectedByGroup[g.id])

  const handleConfirmClick = () => {
    if (missingGroups.length > 0) {
      setAttemptedConfirm(true)
      return
    }

    const slotSelections: ComboSlotSelection[] = groups.map((group) => {
      const productId = selectedByGroup[group.id]
      const product = productsByGroup[group.id]?.find((p) => p.id === productId)!
      return { group, product: { id: product.id, name: product.name } }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto animate-fade-in">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-xl flex items-center justify-between">
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
            const groupMissing = attemptedConfirm && !selectedByGroup[group.id]
            return (
              <div key={group.id} className={groupMissing ? 'border border-red-300 bg-red-50/50 rounded-lg p-3 -m-3' : ''}>
                <h3 className="font-medium text-gray-900 mb-1">{group.name}</h3>
                {group.is_pizza_slot && group.fixed_pizza_size_id && (
                  <p className="text-xs text-gray-500 mb-3">
                    Tamanho: {sizeNameById[group.fixed_pizza_size_id] || '—'} (fixo neste combo)
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
                      const isSelected = selectedByGroup[group.id] === product.id
                      const disabled = !product.in_stock
                      return (
                        <button
                          key={product.id}
                          onClick={() => !disabled && selectProduct(group.id, product.id)}
                          disabled={disabled}
                          className={`w-full flex items-center justify-between gap-3 p-3 rounded-lg border-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                            isSelected ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            {product.image_url && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={product.image_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                            )}
                            <span className="font-medium text-sm truncate">{product.name}</span>
                          </span>
                          {disabled && <span className="text-xs text-gray-400 flex-shrink-0">Esgotado</span>}
                        </button>
                      )
                    })}
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
            Adicionar ao Carrinho · {formatCurrency(Number(comboPrice))}
          </button>
        </div>
      </div>
    </div>
  )
}
