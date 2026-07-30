'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  computeFlavorPriceAtSize,
  computePizzaItemPrice,
  buildPizzaVariationLines,
  getCombinableFlavors,
  type PizzaFlavorSelection,
  type PizzaAdditionalSelection,
} from '@/lib/pizza'
import type { PizzaAdditional, PizzaAdditionalPrice, PizzaFlavor, PizzaFlavorPrice, PizzaSize } from '@/types'
import { Loader2, X } from 'lucide-react'

export interface PizzaOrderResult {
  variations: { group_name: string; option_name: string; price_delta: number }[]
  unitPrice: number
}

interface PizzaOrderModalProps {
  productName: string
  productImageUrl?: string
  pizzaFlavorId: string
  establishmentId: string
  onConfirm: (result: PizzaOrderResult) => void
  onClose: () => void
}

/**
 * Fluxo de pedido de pizza: tamanho -> (opcional) dividir com outros sabores
 * -> adicionais. Compartilhado entre o cardápio público e o balcão — os dois
 * só precisam saber o `pizza_flavor_id` do produto clicado.
 */
export function PizzaOrderModal({ productName, productImageUrl, pizzaFlavorId, establishmentId, onConfirm, onClose }: PizzaOrderModalProps) {
  const [loading, setLoading] = useState(true)
  const [sizes, setSizes] = useState<PizzaSize[]>([])
  const [ownFlavor, setOwnFlavor] = useState<PizzaFlavor | null>(null)
  const [candidateFlavors, setCandidateFlavors] = useState<PizzaFlavor[]>([])
  const [flavorPrices, setFlavorPrices] = useState<PizzaFlavorPrice[]>([])
  const [additionals, setAdditionals] = useState<PizzaAdditional[]>([])
  const [additionalPrices, setAdditionalPrices] = useState<PizzaAdditionalPrice[]>([])

  const [selectedSizeId, setSelectedSizeId] = useState('')
  const [selectedFlavorIds, setSelectedFlavorIds] = useState<string[]>([])
  const [selectedAdditionalIds, setSelectedAdditionalIds] = useState<string[]>([])

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
    const [sizesRes, ownFlavorRes, candidatesRes, additionalsRes] = await Promise.all([
      supabase.from('pizza_sizes').select('*').eq('establishment_id', establishmentId).eq('is_active', true).order('display_order'),
      supabase.from('pizza_flavors').select('*').eq('id', pizzaFlavorId).single(),
      supabase.from('pizza_flavors').select('*').eq('establishment_id', establishmentId).eq('is_active', true).order('display_order'),
      supabase.from('pizza_additionals').select('*').eq('establishment_id', establishmentId).eq('is_active', true).order('display_order'),
    ])

    const sizesData = sizesRes.data || []
    const own = ownFlavorRes.data || null
    const additionalsData = additionalsRes.data || []

    setSizes(sizesData)
    setOwnFlavor(own)
    setCandidateFlavors(candidatesRes.data || [])
    setAdditionals(additionalsData)
    if (own) setSelectedFlavorIds([own.id])
    if (sizesData.length > 0) setSelectedSizeId(sizesData[0].id)

    const flavorIds = Array.from(new Set([...(candidatesRes.data || []).map((f) => f.id), pizzaFlavorId]))
    if (flavorIds.length > 0) {
      const { data } = await supabase.from('pizza_flavor_prices').select('*').in('flavor_id', flavorIds)
      if (data) setFlavorPrices(data)
    }
    const additionalIds = additionalsData.map((a) => a.id)
    if (additionalIds.length > 0) {
      const { data } = await supabase.from('pizza_additional_prices').select('*').in('additional_id', additionalIds)
      if (data) setAdditionalPrices(data)
    }
    setLoading(false)
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

  const selectedSize = sizes.find((s) => s.id === selectedSizeId) || null
  const combinableFlavors = ownFlavor ? getCombinableFlavors(candidateFlavors, ownFlavor) : []

  const priceOfFlavorAt = (flavorId: string, size: PizzaSize) => {
    const delta = flavorPrices.find((p) => p.flavor_id === flavorId && p.size_id === size.id)?.price_delta || 0
    return computeFlavorPriceAtSize(size, delta)
  }

  const priceAtSelectedSize = (flavorId: string) => (selectedSize ? priceOfFlavorAt(flavorId, selectedSize) : 0)

  const handleSelectSize = (size: PizzaSize) => {
    setSelectedSizeId(size.id)
    // O tamanho novo pode aceitar menos sabores que o já escolhido — corta o excedente.
    setSelectedFlavorIds((prev) => (prev.length > size.max_flavors ? prev.slice(0, size.max_flavors) : prev))
  }

  const toggleFlavor = (flavorId: string) => {
    if (!selectedSize || flavorId === ownFlavor?.id) return
    setSelectedFlavorIds((prev) => {
      if (prev.includes(flavorId)) return prev.filter((id) => id !== flavorId)
      if (prev.length >= selectedSize.max_flavors) return prev
      return [...prev, flavorId]
    })
  }

  const toggleAdditional = (additionalId: string) => {
    setSelectedAdditionalIds((prev) =>
      prev.includes(additionalId) ? prev.filter((id) => id !== additionalId) : [...prev, additionalId]
    )
  }

  const flavorSelections: PizzaFlavorSelection[] = selectedSize
    ? selectedFlavorIds
        .map((id) => (id === ownFlavor?.id ? ownFlavor : candidateFlavors.find((f) => f.id === id)))
        .filter((f): f is PizzaFlavor => !!f)
        .map((flavor) => ({ flavor, priceAtSize: priceAtSelectedSize(flavor.id) }))
    : []

  const additionalSelections: PizzaAdditionalSelection[] = selectedSize
    ? selectedAdditionalIds
        .map((id) => additionals.find((a) => a.id === id))
        .filter((a): a is PizzaAdditional => !!a)
        .map((additional) => ({
          additional,
          price: additionalPrices.find((p) => p.additional_id === additional.id && p.size_id === selectedSize.id)?.price || 0,
        }))
    : []

  const priceResult = selectedSize && flavorSelections.length > 0 ? computePizzaItemPrice(flavorSelections, additionalSelections) : null

  const handleConfirm = () => {
    if (!selectedSize || !priceResult) return
    const variations = buildPizzaVariationLines(selectedSize, flavorSelections, additionalSelections)
    onConfirm({ variations, unitPrice: priceResult.unitPrice })
  }

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

  if (sizes.length === 0 || !ownFlavor) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6 text-center animate-fade-in">
          <p className="text-gray-700 mb-4">Esse produto ainda não está com os tamanhos configurados. Fale com a loja.</p>
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
            {productImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={productImageUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
            )}
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 truncate">{productName}</h2>
              {priceResult && <p className="text-sm text-gray-500">{formatCurrency(priceResult.unitPrice)}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded flex-shrink-0" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Passo A: tamanho */}
          <div>
            <h3 className="font-medium text-gray-900 mb-3">Escolha o tamanho</h3>
            <div className="space-y-2">
              {sizes.map((size) => {
                const isSelected = size.id === selectedSizeId
                return (
                  <button
                    key={size.id}
                    onClick={() => handleSelectSize(size)}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-colors ${
                      isSelected ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className="font-medium text-sm">{size.name}</span>
                    <span className="text-sm text-primary-600">{formatCurrency(priceOfFlavorAt(ownFlavor.id, size))}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Passo B: dividir com outro sabor */}
          {selectedSize && selectedSize.max_flavors > 1 && (
            <div>
              <h3 className="font-medium text-gray-900 mb-1">Quer dividir com outro sabor? (opcional)</h3>
              <p className="text-xs text-gray-500 mb-3">
                Escolha até {selectedSize.max_flavors - 1} sabor(es) a mais. Cobramos o valor do sabor mais
                caro entre os escolhidos — {selectedFlavorIds.length}/{selectedSize.max_flavors} selecionado(s).
              </p>
              {combinableFlavors.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum outro sabor disponível pra combinar.</p>
              ) : (
                <div className="space-y-2">
                  {combinableFlavors.map((flavor) => {
                    const isSelected = selectedFlavorIds.includes(flavor.id)
                    const atLimit = !isSelected && selectedFlavorIds.length >= selectedSize.max_flavors
                    return (
                      <button
                        key={flavor.id}
                        onClick={() => toggleFlavor(flavor.id)}
                        disabled={atLimit}
                        className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          isSelected ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <span className="font-medium text-sm">{flavor.name}</span>
                        <span className="text-sm text-primary-600">{formatCurrency(priceAtSelectedSize(flavor.id))}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Passo C: adicionais */}
          {additionals.length > 0 && (
            <div>
              <h3 className="font-medium text-gray-900 mb-3">Adicionais</h3>
              <div className="space-y-2">
                {additionals.map((additional) => {
                  const isSelected = selectedAdditionalIds.includes(additional.id)
                  const price = selectedSize
                    ? additionalPrices.find((p) => p.additional_id === additional.id && p.size_id === selectedSize.id)?.price || 0
                    : 0
                  return (
                    <button
                      key={additional.id}
                      onClick={() => toggleAdditional(additional.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-colors ${
                        isSelected ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className="font-medium text-sm">{additional.name}</span>
                      <span className="text-sm text-primary-600">+ {formatCurrency(Number(price))}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4">
          <button onClick={handleConfirm} disabled={!priceResult} className="btn-primary w-full">
            Adicionar ao Carrinho {priceResult && `· ${formatCurrency(priceResult.unitPrice)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
