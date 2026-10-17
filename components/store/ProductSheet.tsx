'use client'

import { useEffect, useMemo, useState } from 'react'
import { SmartImage } from '@/components/SmartImage'
import { useEscapeKey } from '@/lib/useEscapeKey'
import { formatBRL } from '@/lib/money'
import { toggleGroupOption } from '@/lib/variations'
import type { PublicProduct, VariationGroup, VariationOption } from '@/types'
import { AlertCircle, Minus, Plus, X } from 'lucide-react'

export type GroupWithOptions = VariationGroup & { options: VariationOption[] }

export interface ProductSheetResult {
  quantity: number
  note: string
  optionIds: string[]
  variations: { group_name: string; option_name: string; price_delta: number }[]
  unitPrice: number
}

/**
 * Ficha do produto (bottom sheet no celular): foto grande, descrição,
 * opções com limite de escolha, quantidade, observação e total ao vivo.
 * O preço mostrado é uma prévia; quem cobra é o servidor (place_order).
 */
export function ProductSheet({
  product,
  groups,
  canOrder,
  onConfirm,
  onClose,
}: {
  product: PublicProduct
  groups: GroupWithOptions[]
  canOrder: boolean
  onConfirm: (result: ProductSheetResult) => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [quantity, setQuantity] = useState(1)
  const [note, setNote] = useState('')
  const [attempted, setAttempted] = useState(false)

  useEscapeKey(onClose, true)

  useEffect(() => {
    const initial: Record<string, string[]> = {}
    groups.forEach((g) => {
      initial[g.id] = []
    })
    setSelected(initial)
  }, [groups])

  const sortedGroups = useMemo(() => [...groups].sort((a, b) => a.display_order - b.display_order), [groups])
  const missingGroups = sortedGroups.filter((g) => g.is_required && (selected[g.id]?.length || 0) === 0)

  const chosen = sortedGroups.flatMap((g) =>
    [...(g.options || [])]
      .sort((a, b) => a.display_order - b.display_order)
      .filter((o) => (selected[g.id] || []).includes(o.id))
      .map((o) => ({ group: g, option: o }))
  )
  const unitPrice = Number(product.price) + chosen.reduce((sum, c) => sum + Number(c.option.price_delta || 0), 0)

  const confirm = () => {
    if (missingGroups.length > 0) {
      setAttempted(true)
      document.getElementById(`group-${missingGroups[0].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    onConfirm({
      quantity,
      note: note.trim(),
      optionIds: chosen.map((c) => c.option.id),
      variations: chosen.map((c) => ({ group_name: c.group.name, option_name: c.option.name, price_delta: Number(c.option.price_delta || 0) })),
      unitPrice,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="product-sheet-title">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md max-h-[92vh] rounded-t-3xl sm:rounded-2xl shadow-xl flex flex-col animate-slide-up sm:animate-fade-in overflow-hidden">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-white/90 shadow flex items-center justify-center"
          aria-label="Fechar"
        >
          <X size={18} />
        </button>

        <div className="overflow-y-auto flex-1">
          {product.image_url ? (
            <div className="relative w-full aspect-[4/3] bg-gray-100">
              <SmartImage src={product.image_url} alt={product.name} fill sizes="(max-width: 640px) 100vw, 448px" className="object-cover" />
            </div>
          ) : (
            <div className="h-10" />
          )}

          <div className="p-5">
            <h2 id="product-sheet-title" className="font-display text-2xl font-extrabold text-gray-900 leading-tight pr-8">{product.name}</h2>
            {product.description && <p className="text-sm text-gray-600 mt-1.5">{product.description}</p>}
            <p className="text-lg font-bold text-primary-600 mt-2">{formatBRL(Number(product.price))}</p>

            <div className="mt-5 space-y-6">
              {sortedGroups.map((group) => {
                const count = selected[group.id]?.length || 0
                const missing = attempted && group.is_required && count === 0
                const limitLabel = group.allow_multiple
                  ? group.max_select
                    ? `Escolha até ${group.max_select}`
                    : 'Escolha quantos quiser'
                  : 'Escolha 1'
                return (
                  <fieldset key={group.id} id={`group-${group.id}`} className={missing ? 'rounded-xl ring-2 ring-red-300 p-3 -m-3' : ''}>
                    <legend className="w-full">
                      <div className="flex items-center justify-between gap-2 bg-gray-50 -mx-5 px-5 py-2.5">
                        <div>
                          <span className="font-semibold text-gray-900">{group.name}</span>
                          <span className="block text-xs text-gray-500">{limitLabel}</span>
                        </div>
                        {group.is_required && (
                          <span className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${count > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-900 text-white'}`}>
                            {count > 0 ? 'Ok' : 'Obrigatório'}
                          </span>
                        )}
                      </div>
                    </legend>
                    {missing && <p className="text-xs text-red-600 mt-2">Escolha uma opção para continuar.</p>}
                    <div className="mt-2 divide-y divide-gray-100">
                      {[...(group.options || [])]
                        .sort((a, b) => a.display_order - b.display_order)
                        .map((option) => {
                          const isSelected = (selected[group.id] || []).includes(option.id)
                          const atLimit = !isSelected && group.allow_multiple && !!group.max_select && count >= group.max_select
                          return (
                            <label
                              key={option.id}
                              className={`flex items-center justify-between gap-3 py-3 cursor-pointer ${atLimit ? 'opacity-40 cursor-not-allowed' : ''}`}
                            >
                              <span className="text-sm text-gray-800">{option.name}</span>
                              <span className="flex items-center gap-3">
                                {Number(option.price_delta) > 0 && (
                                  <span className="text-sm text-gray-600">+ {formatBRL(Number(option.price_delta))}</span>
                                )}
                                <input
                                  type={group.allow_multiple ? 'checkbox' : 'radio'}
                                  name={`group-${group.id}`}
                                  checked={isSelected}
                                  disabled={atLimit}
                                  onChange={() =>
                                    setSelected((prev) => ({ ...prev, [group.id]: toggleGroupOption(prev[group.id] || [], option.id, group) }))
                                  }
                                  className={`w-5 h-5 text-primary-500 focus:ring-primary-500 ${group.allow_multiple ? 'rounded' : ''}`}
                                />
                              </span>
                            </label>
                          )
                        })}
                    </div>
                  </fieldset>
                )
              })}

              <div>
                <label htmlFor="item-note" className="block text-sm font-semibold text-gray-900 mb-1.5">Alguma observação?</label>
                <textarea
                  id="item-note"
                  className="input-field text-sm"
                  rows={2}
                  maxLength={200}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ex: sem cebola, ponto da carne bem passado"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 p-4 bg-white" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
          {attempted && missingGroups.length > 0 && (
            <p className="text-sm text-red-600 mb-3 flex items-center gap-1.5">
              <AlertCircle size={15} /> Falta escolher: {missingGroups.map((g) => g.name).join(', ')}
            </p>
          )}
          <div className="flex items-center gap-3">
            <div className="flex items-center border border-gray-200 rounded-xl">
              <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="w-11 h-11 flex items-center justify-center text-primary-600 disabled:text-gray-300" disabled={quantity <= 1} aria-label="Diminuir quantidade">
                <Minus size={18} />
              </button>
              <span className="w-7 text-center font-semibold tabular-nums" aria-live="polite">{quantity}</span>
              <button onClick={() => setQuantity((q) => Math.min(99, q + 1))} className="w-11 h-11 flex items-center justify-center text-primary-600" aria-label="Aumentar quantidade">
                <Plus size={18} />
              </button>
            </div>
            <button onClick={confirm} disabled={!canOrder} className="btn-primary flex-1 h-11 justify-between disabled:opacity-50">
              <span>{canOrder ? 'Adicionar' : 'Loja fechada'}</span>
              <span className="tabular-nums">{formatBRL(unitPrice * quantity)}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
