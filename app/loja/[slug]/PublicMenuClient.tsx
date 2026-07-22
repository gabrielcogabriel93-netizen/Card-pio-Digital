'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { log, logError, logCritical } from '@/lib/logger'
import { isWithinOpeningHours } from '@/lib/hours'
import type { PublicEstablishment, Category, PublicProduct, VariationGroup, VariationOption, CartItem } from '@/types'
import { ShoppingCart, X, Plus, Minus, MapPin, Clock, Loader2, Store, Send } from 'lucide-react'

export default function PublicMenuClient({
  establishment,
  categories,
  products,
}: {
  establishment: PublicEstablishment
  categories: Category[]
  products: PublicProduct[]
}) {
  const [cart, setCart] = useState<CartItem<PublicProduct>[]>([])
  const [showCart, setShowCart] = useState(false)
  const [showVariations, setShowVariations] = useState<PublicProduct | null>(null)
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [website, setWebsite] = useState('') // honeypot: campo invisível, só bot preenche
  const [formOpenedAt] = useState(() => Date.now())
  const [saving, setSaving] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string>('all')

  // A loja fecha automaticamente fora do horário configurado, mesmo que o
  // lojista tenha esquecido de virar a chave manual para "fechado".
  const isEffectivelyOpen = useMemo(() => {
    if (!establishment.is_open) return false
    return isWithinOpeningHours(establishment.opening_hours)
  }, [establishment.is_open, establishment.opening_hours])

  const deliveryFee = Number(establishment.delivery_fee) || 0

  const addToCart = async (product: PublicProduct) => {
    const supabase = createClient()
    const { data: groups } = await supabase
      .from('variation_groups')
      .select('*, options:variation_options(*)')
      .eq('product_id', product.id)
      .order('display_order')

    if (groups && groups.length > 0) {
      setShowVariations(product)
      return
    }

    addToCartDirect(product, [])
  }

  const addToCartDirect = (product: PublicProduct, variations: CartItem<PublicProduct>['variations']) => {
    const variationsKey = variations.map(v => `${v.group_name}:${v.option_name}`).sort().join('|')
    const existingIndex = cart.findIndex(
      item => item.product.id === product.id &&
      item.variations.map(v => `${v.group_name}:${v.option_name}`).sort().join('|') === variationsKey
    )

    if (existingIndex >= 0) {
      const updated = [...cart]
      updated[existingIndex].quantity += 1
      updated[existingIndex].total_price = updated[existingIndex].unit_price * updated[existingIndex].quantity
      setCart(updated)
    } else {
      const priceDelta = variations.reduce((sum, v) => sum + v.price_delta, 0)
      const unitPrice = Number(product.price) + priceDelta
      setCart([...cart, {
        product,
        quantity: 1,
        variations,
        unit_price: unitPrice,
        total_price: unitPrice,
      }])
    }

    setShowVariations(null)
  }

  const updateQuantity = (index: number, delta: number) => {
    const updated = [...cart]
    const item = updated[index]
    item.quantity = Math.max(1, item.quantity + delta)
    item.total_price = item.unit_price * item.quantity
    setCart(updated)
  }

  const removeFromCart = (index: number) => {
    setCart(cart.filter((_, i) => i !== index))
  }

  const handleSendOrder = async () => {
    if (!customerName.trim() || !customerPhone.trim()) return

    // Honeypot: campo invisível para humanos. Se veio preenchido, é bot —
    // finge sucesso sem gravar nada.
    if (website.trim()) {
      log('loja', 'pedido bloqueado (honeypot preenchido)')
      setCart([])
      setShowCustomerModal(false)
      return
    }

    // Um humano normalmente leva pelo menos alguns segundos preenchendo o
    // formulário; um bot script costuma submeter quase instantaneamente.
    if (Date.now() - formOpenedAt < 1500) {
      log('loja', 'pedido bloqueado (submissão rápida demais)')
      return
    }

    setSaving(true)
    log('loja', 'enviando pedido...', { itens: cart.length, establishmentId: establishment.id })

    try {
      const subtotal = cart.reduce((sum, item) => sum + item.total_price, 0)
      const total = subtotal + deliveryFee

      const supabase = createClient()

      const { error: orderError } = await supabase.from('orders').insert({
        establishment_id: establishment.id,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        items: cart.map(item => ({
          product_id: item.product.id,
          product_name: item.product.name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
          image_url: item.product.image_url,
          variations: item.variations,
        })),
        subtotal,
        shipping_fee: deliveryFee,
        total,
        status: 'pending',
        source: 'online',
        notes: notes.trim() || null,
      })

      if (orderError) throw orderError
      log('loja', 'pedido salvo com sucesso, montando mensagem do WhatsApp...')

      let message = `🛵 *Novo Pedido - ${establishment.name}*\n\n`
      message += `👤 *Cliente:* ${customerName.trim()}\n`
      message += `📱 *Telefone:* ${customerPhone.trim()}\n\n`
      message += `📋 *Itens do Pedido:*\n`

      cart.forEach((item, index) => {
        message += `\n${index + 1}. *${item.product.name}*`
        if (item.variations.length > 0) {
          item.variations.forEach(v => {
            message += `\n   - ${v.group_name}: ${v.option_name}`
          })
        }
        message += `\n   Qtd: ${item.quantity} x R$ ${item.unit_price.toFixed(2)}`
        message += ` = R$ ${item.total_price.toFixed(2)}`
      })

      if (deliveryFee > 0) {
        message += `\n\n🛵 *Taxa de entrega:* R$ ${deliveryFee.toFixed(2)}`
      }
      if (notes.trim()) {
        message += `\n\n📝 *Observações:* ${notes.trim()}`
      }

      message += `\n\n💰 *Total: R$ ${total.toFixed(2)}*`

      const encodedMessage = encodeURIComponent(message)
      const whatsappUrl = `https://wa.me/${establishment.whatsapp_number.replace(/\D/g, '')}?text=${encodedMessage}`

      log('loja', 'abrindo WhatsApp', { whatsappNumber: establishment.whatsapp_number })
      window.open(whatsappUrl, '_blank')

      setCart([])
      setShowCustomerModal(false)
      setCustomerName('')
      setCustomerPhone('')
      setNotes('')
      setShowCart(false)
    } catch (err: any) {
      logError('loja', 'erro ao enviar pedido', err)
      logCritical('loja:enviar-pedido', err.message, err, establishment.id)
      alert('Erro ao enviar pedido: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const cartTotal = cart.reduce((sum, item) => sum + item.total_price, 0) + deliveryFee
  const cartSubtotal = cart.reduce((sum, item) => sum + item.total_price, 0)
  const cartItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  const filteredProducts = activeCategory === 'all'
    ? products
    : products.filter(p => p.category_id === activeCategory)

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            {establishment.logo_url && (
              <img
                src={establishment.logo_url}
                alt={establishment.name}
                className="w-12 h-12 rounded-xl object-cover flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-lg text-gray-900 truncate">{establishment.name}</h1>
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <span className={`flex items-center gap-1 ${
                  isEffectivelyOpen ? 'text-green-600' : 'text-red-500'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    isEffectivelyOpen ? 'bg-green-500' : 'bg-red-500'
                  }`} />
                  {isEffectivelyOpen ? 'Aberto' : 'Fechado'}
                </span>
                {establishment.address && (
                  <span className="flex items-center gap-1 text-gray-400 truncate">
                    <MapPin size={12} />
                    {establishment.address}
                  </span>
                )}
              </div>
            </div>
            {/* Cart Button */}
            <button
              onClick={() => setShowCart(true)}
              className="relative p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors flex-shrink-0"
              aria-label="Abrir carrinho"
            >
              <ShoppingCart size={22} className="text-gray-700" />
              {cartItemsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                  {cartItemsCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Categories Scroll */}
        {categories.length > 0 && (
          <div className="border-t border-gray-100">
            <div className="max-w-2xl mx-auto px-4 py-2 overflow-x-auto">
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveCategory('all')}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                    activeCategory === 'all'
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Todos
                </button>
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                      activeCategory === cat.id
                        ? 'bg-primary-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Products */}
      <main className="max-w-2xl mx-auto px-4 py-6 pb-32">
        {!isEffectivelyOpen && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-center">
            <Clock size={24} className="text-amber-500 mx-auto mb-2" />
            <p className="font-medium text-amber-800">Loja fechada no momento</p>
            <p className="text-sm text-amber-600 mt-1">
              Você pode visualizar o cardápio, mas os pedidos estão desativados.
            </p>
          </div>
        )}

        {filteredProducts.length === 0 ? (
          <div className="text-center py-12">
            <Store size={48} className="text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Nenhum produto disponível nesta categoria.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredProducts.map(product => {
              const disabled = !isEffectivelyOpen || !product.in_stock
              return (
                <button
                  key={product.id}
                  onClick={() => !disabled && addToCart(product)}
                  disabled={disabled}
                  className="w-full text-left bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow disabled:opacity-60 disabled:cursor-not-allowed flex gap-4"
                >
                  {product.image_url && (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900">{product.name}</h3>
                    {product.description && (
                      <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{product.description}</p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-lg font-bold text-primary-600">
                        {formatCurrency(product.price)}
                      </span>
                      {!product.in_stock ? (
                        <span className="text-sm text-red-500 font-medium">Esgotado</span>
                      ) : isEffectivelyOpen && (
                        <span className="text-sm text-primary-500 font-medium">Adicionar</span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </main>

      {/* Cart Floating Button */}
      {cartItemsCount > 0 && isEffectivelyOpen && (
        <button
          onClick={() => setShowCart(true)}
          className="fixed bottom-4 left-4 right-4 max-w-2xl mx-auto z-20 btn-primary shadow-lg py-3"
        >
          <ShoppingCart size={20} />
          <span>Ver Carrinho ({cartItemsCount} itens)</span>
          <span className="font-bold">{formatCurrency(cartTotal)}</span>
        </button>
      )}

      {/* Cart Sidebar */}
      {showCart && (
        <div className="fixed inset-0 z-50">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowCart(false)} />
          <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-xl animate-slide-in flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Seu Carrinho</h2>
              <button onClick={() => setShowCart(false)} className="p-1 hover:bg-gray-100 rounded" aria-label="Fechar carrinho">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <ShoppingCart size={40} className="mx-auto mb-2" />
                  <p>Carrinho vazio</p>
                </div>
              ) : (
                cart.map((item, index) => (
                  <div key={index} className="flex gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">{item.product.name}</p>
                      {item.variations.map((v, i) => (
                        <p key={i} className="text-xs text-gray-500">{v.group_name}: {v.option_name}</p>
                      ))}
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => updateQuantity(index, -1)}
                          className="w-7 h-7 bg-gray-200 rounded flex items-center justify-center hover:bg-gray-300"
                          aria-label="Diminuir quantidade"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(index, 1)}
                          className="w-7 h-7 bg-gray-200 rounded flex items-center justify-center hover:bg-gray-300"
                          aria-label="Aumentar quantidade"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-medium">{formatCurrency(item.total_price)}</p>
                      <button
                        onClick={() => removeFromCart(index)}
                        className="text-red-400 hover:text-red-600 text-sm mt-1"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {cart.length > 0 && (
              <div className="p-4 border-t border-gray-200 space-y-2">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatCurrency(cartSubtotal)}</span>
                </div>
                {deliveryFee > 0 && (
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Taxa de entrega</span>
                    <span>{formatCurrency(deliveryFee)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold pt-1">
                  <span>Total</span>
                  <span className="text-primary-600">{formatCurrency(cartTotal)}</span>
                </div>
                <button
                  onClick={() => { setShowCart(false); setShowCustomerModal(true) }}
                  className="btn-primary w-full py-3 mt-2"
                >
                  <Send size={18} />
                  Enviar Pedido
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Variations Modal */}
      {showVariations && (
        <VariationsModal
          product={showVariations}
          onConfirm={(variations) => addToCartDirect(showVariations, variations)}
          onClose={() => setShowVariations(null)}
        />
      )}

      {/* Customer Info Modal */}
      {showCustomerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowCustomerModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-fade-in p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Finalizar Pedido</h2>
            <p className="text-sm text-gray-600 mb-4">Informe seus dados para enviar o pedido.</p>

            <div className="space-y-4">
              {/* Honeypot - invisível para humanos */}
              <div className="absolute -left-[9999px]" aria-hidden="true">
                <label htmlFor="website">Não preencha este campo</label>
                <input
                  id="website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input
                  type="text"
                  className="input-field"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Seu nome"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone *</label>
                <input
                  type="tel"
                  className="input-field"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="(11) 99999-8888"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                <textarea
                  className="input-field"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: sem cebola, troco para R$ 50..."
                />
              </div>
              <p className="text-xs text-gray-500">
                O pedido será enviado via WhatsApp para o estabelecimento.
              </p>

              <div className="border-t border-gray-200 pt-4">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatCurrency(cartSubtotal)}</span>
                </div>
                {deliveryFee > 0 && (
                  <div className="flex justify-between text-sm text-gray-600 mt-1">
                    <span>Taxa de entrega</span>
                    <span>{formatCurrency(deliveryFee)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg mt-2 mb-4">
                  <span>Total</span>
                  <span className="text-primary-600">{formatCurrency(cartTotal)}</span>
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setShowCustomerModal(false)} className="btn-secondary flex-1">
                    Cancelar
                  </button>
                  <button
                    onClick={handleSendOrder}
                    className="btn-primary flex-1"
                    disabled={saving || !customerName.trim() || !customerPhone.trim()}
                  >
                    {saving ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <>
                        <Send size={18} />
                        Enviar Pedido
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Variations Modal Component
function VariationsModal({
  product,
  onConfirm,
  onClose,
}: {
  product: PublicProduct
  onConfirm: (variations: CartItem<PublicProduct>['variations']) => void
  onClose: () => void
}) {
  const [groups, setGroups] = useState<(VariationGroup & { options: VariationOption[] })[]>([])
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadVariations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const loadVariations = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('variation_groups')
      .select('*, options:variation_options(*)')
      .eq('product_id', product.id)
      .order('display_order')

    if (data) {
      setGroups(data as any)
      const initial: Record<string, string[]> = {}
      data.forEach((g: any) => { initial[g.id] = [] })
      setSelected(initial)
    }
    setLoading(false)
  }

  const toggleOption = (groupId: string, optionId: string, allowMultiple: boolean) => {
    setSelected(prev => {
      const current = [...(prev[groupId] || [])]
      if (allowMultiple) {
        const index = current.indexOf(optionId)
        if (index >= 0) current.splice(index, 1)
        else current.push(optionId)
        return { ...prev, [groupId]: current }
      }
      return { ...prev, [groupId]: [optionId] }
    })
  }

  const handleConfirm = () => {
    const variations: CartItem<PublicProduct>['variations'] = []
    groups.forEach(group => {
      const selectedOptions = selected[group.id] || []
      selectedOptions.forEach(optId => {
        const option = group.options.find(o => o.id === optId)
        if (option) {
          variations.push({
            group_name: group.name,
            option_name: option.name,
            price_delta: Number(option.price_delta),
          })
        }
      })
    })
    onConfirm(variations)
  }

  const isRequiredFilled = () => {
    return groups.every(group => {
      if (group.is_required) return (selected[group.id]?.length || 0) > 0
      return true
    })
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
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

  // Sem variações cadastradas — adiciona direto (fallback de segurança)
  if (groups.length === 0) {
    onConfirm([])
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto animate-fade-in">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-xl flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{product.name}</h2>
            <p className="text-sm text-gray-500">{formatCurrency(product.price)}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {groups.map(group => (
            <div key={group.id}>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="font-medium text-gray-900">{group.name}</h3>
                {group.is_required && (
                  <span className="text-xs text-red-500">*Obrigatório</span>
                )}
                {group.allow_multiple && (
                  <span className="text-xs text-gray-400">(múltipla escolha)</span>
                )}
              </div>
              <div className="space-y-2">
                {group.options.map(option => {
                  const isSelected = (selected[group.id] || []).includes(option.id)
                  return (
                    <button
                      key={option.id}
                      onClick={() => toggleOption(group.id, option.id, group.allow_multiple)}
                      className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-colors ${
                        isSelected
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className="font-medium text-sm">{option.name}</span>
                      {Number(option.price_delta) > 0 && (
                        <span className="text-sm text-primary-600">
                          + {formatCurrency(Number(option.price_delta))}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4">
          <button
            onClick={handleConfirm}
            disabled={!isRequiredFilled()}
            className="btn-primary w-full"
          >
            Adicionar ao Carrinho
          </button>
        </div>
      </div>
    </div>
  )
}
