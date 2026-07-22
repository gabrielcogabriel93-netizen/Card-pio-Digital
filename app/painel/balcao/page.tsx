'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { log, logError } from '@/lib/logger'
import type { Product, Category, CartItem, VariationGroup, VariationOption } from '@/types'
import { Search, Plus, Minus, Trash2, ShoppingCart, X, Loader2, CheckCircle } from 'lucide-react'

export default function BalcaoPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [loading, setLoading] = useState(true)
  const [showVariations, setShowVariations] = useState<Product | null>(null)
  const [selectedVariations, setSelectedVariations] = useState<Record<string, string[]>>({})
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('dinheiro')
  const [showCheckout, setShowCheckout] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [establishmentId, setEstablishmentId] = useState<string>('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    log('painel:balcao', 'carregando produtos e categorias...')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: est, error: estError } = await supabase
        .from('establishments')
        .select('id')
        .eq('owner_id', user.id)
        .single()

      if (estError) logError('painel:balcao', 'erro ao buscar estabelecimento', estError)
      if (!est) return
      setEstablishmentId(est.id)

      const [catsRes, prodsRes] = await Promise.all([
        supabase.from('categories').select('*').eq('establishment_id', est.id).order('display_order'),
        supabase.from('products').select('*').eq('establishment_id', est.id).eq('is_active', true).order('display_order'),
      ])

      if (catsRes.error) logError('painel:balcao', 'erro ao carregar categorias', catsRes.error)
      if (prodsRes.error) logError('painel:balcao', 'erro ao carregar produtos', prodsRes.error)
      if (catsRes.data) setCategories(catsRes.data)
      if (prodsRes.data) setProducts(prodsRes.data)
      log('painel:balcao', 'dados carregados', {
        categorias: catsRes.data?.length || 0,
        produtos: prodsRes.data?.length || 0,
      })
    } catch (error) {
      logError('painel:balcao', 'exceção ao carregar dados', error)
    } finally {
      setLoading(false)
    }
  }

  const addToCart = async (product: Product) => {
    // Verificar se tem variações
    const supabase = createClient()
    const { data: groups } = await supabase
      .from('variation_groups')
      .select('*, options:variation_options(*)')
      .eq('product_id', product.id)
      .order('display_order')

    if (groups && groups.length > 0) {
      setShowVariations(product)
      setSelectedVariations({})
      return
    }

    addToCartDirect(product, [])
  }

  const addToCartDirect = (product: Product, variations: CartItem['variations']) => {
    const variationsKey = variations.map(v => `${v.group_name}:${v.option_name}`).sort().join('|')
    const existingIndex = cart.findIndex(
      item => item.product.id === product.id &&
      item.variations.map(v => `${v.group_name}:${v.option_name}`).sort().join('|') === variationsKey
    )

    if (existingIndex >= 0) {
      const current = cart[existingIndex]
      if (product.track_stock && current.quantity + 1 > product.stock_qty) {
        alert(`Estoque insuficiente. Disponível: ${product.stock_qty}`)
        setShowVariations(null)
        return
      }
      const updated = [...cart]
      updated[existingIndex].quantity += 1
      updated[existingIndex].total_price = updated[existingIndex].unit_price * updated[existingIndex].quantity
      setCart(updated)
    } else {
      if (product.track_stock && product.stock_qty < 1) {
        alert('Produto sem estoque disponível.')
        setShowVariations(null)
        return
      }
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
    const maxQty = item.product.track_stock ? item.product.stock_qty : Infinity
    const nextQty = Math.max(1, item.quantity + delta)

    if (delta > 0 && nextQty > maxQty) {
      alert(`Estoque insuficiente. Disponível: ${maxQty}`)
      return
    }

    item.quantity = nextQty
    item.total_price = item.unit_price * item.quantity
    setCart(updated)
  }

  const removeFromCart = (index: number) => {
    setCart(cart.filter((_, i) => i !== index))
  }

  const handleFinishSale = async () => {
    if (!customerName.trim() || !customerPhone.trim()) return
    setSaving(true)
    log('painel:balcao', 'finalizando venda...', { itens: cart.length, paymentMethod })

    try {
      const subtotal = cart.reduce((sum, item) => sum + item.total_price, 0)
      const total = subtotal

      const supabase = createClient()
      const { error } = await supabase.from('orders').insert({
        establishment_id: establishmentId,
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
        shipping_fee: 0,
        total,
        status: 'completed',
        source: 'balcao',
        payment_method: paymentMethod,
      })

      if (error) throw error
      log('painel:balcao', 'pedido de balcão criado, baixando estoque...')

      // Baixar estoque
      for (const item of cart) {
        if (item.product.track_stock) {
          const { error: rpcError } = await supabase.rpc('decrement_product_stock', {
            product_id: item.product.id,
            quantity: item.quantity,
          })
          if (rpcError) logError('painel:balcao', 'erro ao baixar estoque', { item: item.product.name, rpcError })
        }
      }

      // Criar entrada financeira
      const { error: financeError } = await supabase.from('financial_entries').insert({
        establishment_id: establishmentId,
        type: 'income',
        amount: total,
        description: `Venda balcão - ${customerName.trim()}`,
      })
      if (financeError) throw financeError

      log('painel:balcao', 'venda finalizada com sucesso', { total })
      setSuccess(true)
      setCart([])
      setCustomerName('')
      setCustomerPhone('')
      setPaymentMethod('dinheiro')
      setShowCheckout(false)

      setTimeout(() => setSuccess(false), 3000)
    } catch (error: any) {
      logError('painel:balcao', 'erro ao finalizar venda', error)
      alert('Erro ao finalizar venda: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = filterCategory === 'all' || p.category_id === filterCategory
    return matchesSearch && matchesCategory
  })

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-primary-500" />
      </div>
    )
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-8rem)]">
      {/* Products Area */}
      <div className="flex-1 flex flex-col">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Balcão / PDV</h1>
          <p className="text-gray-600 mt-1">Venda presencial rápida.</p>
        </div>

        {/* Search and Filter */}
        <div className="flex gap-4 mb-4">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar produto..."
              className="input-field pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <select
            className="input-field w-48"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="all">Todas</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>

        {/* Products Grid */}
        <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 content-start">
          {filteredProducts.map(product => {
            const outOfStock = product.track_stock && product.stock_qty <= 0
            return (
            <button
              key={product.id}
              onClick={() => !outOfStock && addToCart(product)}
              disabled={outOfStock}
              className="card-hover text-left p-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {product.image_url && (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-full h-24 object-cover rounded-lg mb-2"
                />
              )}
              <p className="font-medium text-sm text-gray-900 truncate">{product.name}</p>
              <p className="text-primary-600 font-bold text-sm mt-1">
                {formatCurrency(product.price)}
              </p>
              {outOfStock ? (
                <p className="text-xs text-red-500 mt-1 font-medium">Esgotado</p>
              ) : product.track_stock && product.stock_qty <= 5 && (
                <p className="text-xs text-red-500 mt-1">Estoque: {product.stock_qty}</p>
              )}
            </button>
            )
          })}
        </div>
      </div>

      {/* Cart Area */}
      <div className="w-full lg:w-96 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <ShoppingCart size={20} className="text-primary-500" />
            <h2 className="font-semibold text-gray-900">Carrinho</h2>
            <span className="text-sm text-gray-500">({cart.length} itens)</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <ShoppingCart size={40} className="mx-auto mb-2" />
              <p className="text-sm">Carrinho vazio</p>
              <p className="text-xs mt-1">Clique nos produtos para adicionar</p>
            </div>
          ) : (
            cart.map((item, index) => (
              <div key={index} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate">{item.product.name}</p>
                  {item.variations.map((v, i) => (
                    <p key={i} className="text-xs text-gray-500">{v.group_name}: {v.option_name}</p>
                  ))}
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => updateQuantity(index, -1)}
                      className="w-6 h-6 bg-gray-200 rounded flex items-center justify-center hover:bg-gray-300"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="text-sm font-medium">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(index, 1)}
                      className="w-6 h-6 bg-gray-200 rounded flex items-center justify-center hover:bg-gray-300"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
                <div className="text-right ml-2">
                  <p className="font-medium text-sm">{formatCurrency(item.total_price)}</p>
                  <button
                    onClick={() => removeFromCart(index)}
                    className="text-red-400 hover:text-red-600 mt-1"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Cart Footer */}
        {cart.length > 0 && (
          <div className="p-4 border-t border-gray-200 space-y-3">
            <div className="flex justify-between font-bold text-lg">
              <span>Total</span>
              <span className="text-primary-600">
                {formatCurrency(cart.reduce((sum, item) => sum + item.total_price, 0))}
              </span>
            </div>
            <button
              onClick={() => setShowCheckout(true)}
              className="btn-primary w-full"
            >
              Finalizar Venda
            </button>
          </div>
        )}
      </div>

      {/* Variations Modal */}
      {showVariations && (
        <VariationModal
          product={showVariations}
          onConfirm={(variations) => addToCartDirect(showVariations, variations)}
          onClose={() => setShowVariations(null)}
        />
      )}

      {/* Checkout Modal */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowCheckout(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md animate-fade-in p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Finalizar Venda</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do cliente *</label>
                <input
                  type="text"
                  className="input-field"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Nome do cliente"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Forma de pagamento</label>
                <select
                  className="input-field"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="dinheiro">Dinheiro</option>
                  <option value="cartao_credito">Cartão de Crédito</option>
                  <option value="cartao_debito">Cartão de Débito</option>
                  <option value="pix">PIX</option>
                  <option value="outro">Outro</option>
                </select>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span className="text-primary-600">
                    {formatCurrency(cart.reduce((sum, item) => sum + item.total_price, 0))}
                  </span>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowCheckout(false)} className="btn-secondary flex-1">
                  Cancelar
                </button>
                <button
                  onClick={handleFinishSale}
                  className="btn-primary flex-1"
                  disabled={saving || !customerName.trim() || !customerPhone.trim()}
                >
                  {saving ? <Loader2 size={18} className="animate-spin" /> : 'Confirmar Venda'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Toast */}
      {success && (
        <div className="fixed bottom-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-fade-in">
          <CheckCircle size={20} />
          <span>Venda finalizada com sucesso!</span>
        </div>
      )}
    </div>
  )
}

// Variation Modal Component
function VariationModal({
  product,
  onConfirm,
  onClose,
}: {
  product: Product
  onConfirm: (variations: CartItem['variations']) => void
  onClose: () => void
}) {
  const [groups, setGroups] = useState<(VariationGroup & { options: VariationOption[] })[]>([])
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadVariations()
  }, [])

  const loadVariations = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('variation_groups')
      .select('*, options:variation_options(*)')
      .eq('product_id', product.id)
      .order('display_order')

    if (data) {
      setGroups(data)
      // Initialize selections
      const initial: Record<string, string[]> = {}
      data.forEach(g => {
        initial[g.id] = []
      })
      setSelected(initial)
    }
    setLoading(false)
  }

  const toggleOption = (groupId: string, optionId: string, allowMultiple: boolean) => {
    setSelected(prev => {
      const current = [...(prev[groupId] || [])]
      if (allowMultiple) {
        const index = current.indexOf(optionId)
        if (index >= 0) {
          current.splice(index, 1)
        } else {
          current.push(optionId)
        }
      } else {
        return { ...prev, [groupId]: [optionId] }
      }
      return { ...prev, [groupId]: current }
    })
  }

  const handleConfirm = () => {
    const variations: CartItem['variations'] = []
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
      if (group.is_required) {
        return (selected[group.id]?.length || 0) > 0
      }
      return true
    })
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto animate-fade-in">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-xl flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{product.name}</h2>
            <p className="text-sm text-gray-500">Selecione as variações</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
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
                      {option.price_delta > 0 && (
                        <span className="text-sm text-primary-600">
                          + R$ {Number(option.price_delta).toFixed(2)}
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
