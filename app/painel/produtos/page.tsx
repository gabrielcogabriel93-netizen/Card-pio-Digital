'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { log, logError } from '@/lib/logger'
import type { Product, Category, VariationGroup, VariationOption } from '@/types'
import { Plus, Search, Edit2, Trash2, ChevronDown, ChevronUp, X, GripVertical, Loader2, ToggleLeft, ToggleRight, Layers } from 'lucide-react'

type GroupWithOptions = VariationGroup & { options: VariationOption[] }

export default function ProdutosPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    category_id: '',
    stock_qty: '0',
    track_stock: true,
    is_active: true,
    image_url: '',
  })

  // Variações
  const [variationGroups, setVariationGroups] = useState<GroupWithOptions[]>([])
  const [loadingVariations, setLoadingVariations] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupRequired, setNewGroupRequired] = useState(false)
  const [newGroupMultiple, setNewGroupMultiple] = useState(false)
  const [optionDrafts, setOptionDrafts] = useState<Record<string, { name: string; price: string }>>({})

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    log('painel:produtos', 'carregando produtos e categorias...')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        log('painel:produtos', 'sem usuário logado')
        return
      }

      const { data: est, error: estError } = await supabase
        .from('establishments')
        .select('id')
        .eq('owner_id', user.id)
        .single()

      if (estError) logError('painel:produtos', 'erro ao buscar estabelecimento', estError)
      if (!est) return

      // Carregar categorias
      const { data: cats, error: catsError } = await supabase
        .from('categories')
        .select('*')
        .eq('establishment_id', est.id)
        .order('display_order')

      if (catsError) logError('painel:produtos', 'erro ao carregar categorias', catsError)
      if (cats) setCategories(cats)

      // Carregar produtos
      const { data: prods, error: prodsError } = await supabase
        .from('products')
        .select('*')
        .eq('establishment_id', est.id)
        .order('display_order')

      if (prodsError) logError('painel:produtos', 'erro ao carregar produtos', prodsError)
      if (prods) setProducts(prods)

      log('painel:produtos', 'dados carregados', { categorias: cats?.length || 0, produtos: prods?.length || 0 })
    } catch (error) {
      logError('painel:produtos', 'exceção ao carregar dados', error)
    } finally {
      setLoading(false)
    }
  }

  const openNewProduct = () => {
    setEditingProduct(null)
    setFormData({
      name: '',
      description: '',
      price: '',
      category_id: '',
      stock_qty: '0',
      track_stock: true,
      is_active: true,
      image_url: '',
    })
    setVariationGroups([])
    setShowModal(true)
  }

  const openEditProduct = (product: Product) => {
    setEditingProduct(product)
    setFormData({
      name: product.name,
      description: product.description || '',
      price: String(product.price),
      category_id: product.category_id || '',
      stock_qty: String(product.stock_qty),
      track_stock: product.track_stock,
      is_active: product.is_active,
      image_url: product.image_url || '',
    })
    setShowModal(true)
    loadVariations(product.id)
  }

  const loadVariations = async (productId: string) => {
    setLoadingVariations(true)
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from('variation_groups')
        .select('*, options:variation_options(*)')
        .eq('product_id', productId)
        .order('display_order')

      if (data) {
        setVariationGroups(
          (data as GroupWithOptions[]).map((g) => ({
            ...g,
            options: [...g.options].sort((a, b) => a.display_order - b.display_order),
          }))
        )
      }
    } catch (error) {
      console.error('Erro ao carregar variações:', error)
    } finally {
      setLoadingVariations(false)
    }
  }

  const handleAddGroup = async () => {
    if (!editingProduct || !newGroupName.trim()) return
    try {
      const supabase = createClient()
      const maxOrder = variationGroups.reduce((max, g) => Math.max(max, g.display_order), -1)
      const { error } = await supabase.from('variation_groups').insert({
        product_id: editingProduct.id,
        name: newGroupName.trim(),
        is_required: newGroupRequired,
        allow_multiple: newGroupMultiple,
        display_order: maxOrder + 1,
      })
      if (error) throw error

      setNewGroupName('')
      setNewGroupRequired(false)
      setNewGroupMultiple(false)
      await loadVariations(editingProduct.id)
    } catch (error: any) {
      alert('Erro ao criar grupo de variação: ' + error.message)
    }
  }

  const handleDeleteGroup = async (group: GroupWithOptions) => {
    if (!editingProduct) return
    if (!confirm(`Excluir o grupo "${group.name}" e todas as suas opções?`)) return
    try {
      const supabase = createClient()
      const { error } = await supabase.from('variation_groups').delete().eq('id', group.id)
      if (error) throw error
      await loadVariations(editingProduct.id)
    } catch (error: any) {
      alert('Erro ao excluir grupo: ' + error.message)
    }
  }

  const handleToggleGroupFlag = async (group: GroupWithOptions, field: 'is_required' | 'allow_multiple') => {
    if (!editingProduct) return
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('variation_groups')
        .update({ [field]: !group[field] })
        .eq('id', group.id)
      if (error) throw error
      await loadVariations(editingProduct.id)
    } catch (error: any) {
      alert('Erro ao atualizar grupo: ' + error.message)
    }
  }

  const handleAddOption = async (group: GroupWithOptions) => {
    if (!editingProduct) return
    const draft = optionDrafts[group.id]
    if (!draft || !draft.name.trim()) return

    try {
      const supabase = createClient()
      const maxOrder = group.options.reduce((max, o) => Math.max(max, o.display_order), -1)
      const { error } = await supabase.from('variation_options').insert({
        variation_group_id: group.id,
        name: draft.name.trim(),
        price_delta: parseFloat(draft.price) || 0,
        display_order: maxOrder + 1,
      })
      if (error) throw error

      setOptionDrafts({ ...optionDrafts, [group.id]: { name: '', price: '' } })
      await loadVariations(editingProduct.id)
    } catch (error: any) {
      alert('Erro ao adicionar opção: ' + error.message)
    }
  }

  const handleDeleteOption = async (option: VariationOption) => {
    if (!editingProduct) return
    try {
      const supabase = createClient()
      const { error } = await supabase.from('variation_options').delete().eq('id', option.id)
      if (error) throw error
      await loadVariations(editingProduct.id)
    } catch (error: any) {
      alert('Erro ao excluir opção: ' + error.message)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    log('painel:produtos', editingProduct ? 'salvando edição de produto' : 'criando novo produto', { name: formData.name })

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: est } = await supabase
        .from('establishments')
        .select('id')
        .eq('owner_id', user.id)
        .single()

      if (!est) return

      const productData = {
        establishment_id: est.id,
        name: formData.name,
        description: formData.description || null,
        price: parseFloat(formData.price),
        category_id: formData.category_id || null,
        stock_qty: parseInt(formData.stock_qty) || 0,
        track_stock: formData.track_stock,
        is_active: formData.is_active,
        image_url: formData.image_url || null,
      }

      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', editingProduct.id)
        
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('products')
          .insert(productData)
        
        if (error) throw error
      }

      log('painel:produtos', 'produto salvo com sucesso')
      await loadData()
      setShowModal(false)
    } catch (error: any) {
      logError('painel:produtos', 'erro ao salvar produto', error)
      alert('Erro ao salvar: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (product: Product) => {
    if (!confirm(`Tem certeza que deseja excluir "${product.name}"?`)) return
    log('painel:produtos', 'excluindo produto', { id: product.id, name: product.name })

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', product.id)

      if (error) throw error
      log('painel:produtos', 'produto excluído com sucesso')
      await loadData()
    } catch (error: any) {
      logError('painel:produtos', 'erro ao excluir produto', error)
      alert('Erro ao excluir: ' + error.message)
    }
  }

  const toggleActive = async (product: Product) => {
    try {
      const supabase = createClient()
      await supabase
        .from('products')
        .update({ is_active: !product.is_active })
        .eq('id', product.id)
      
      await loadData()
    } catch (error) {
      console.error('Erro ao alterar status:', error)
    }
  }

  const filteredProducts = products.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description?.toLowerCase() || '').includes(search.toLowerCase())
    const matchesCategory = filterCategory === 'all' || p.category_id === filterCategory
    return matchesSearch && matchesCategory
  })

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Produtos</h1>
          <p className="text-gray-600 mt-1">Gerencie seu cardápio.</p>
        </div>
        <button onClick={openNewProduct} className="btn-primary">
          <Plus size={18} />
          Novo Produto
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar produtos..."
            className="input-field pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input-field sm:w-48"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
        >
          <option value="all">Todas categorias</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>

      {/* Products Grid */}
      {filteredProducts.length === 0 ? (
        <div className="card text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Package size={32} className="text-gray-400" />
          </div>
          <p className="text-gray-600 mb-2">Nenhum produto encontrado.</p>
          <button onClick={openNewProduct} className="btn-primary">
            <Plus size={18} />
            Adicionar primeiro produto
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((product) => {
            const category = categories.find((c) => c.id === product.category_id)
            return (
              <div key={product.id} className={`card-hover ${!product.is_active ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 truncate">{product.name}</h3>
                    {category && (
                      <span className="text-xs text-gray-500">{category.name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={() => toggleActive(product)}
                      className="p-1.5 hover:bg-gray-100 rounded"
                      title={product.is_active ? 'Desativar' : 'Ativar'}
                    >
                      {product.is_active ? (
                        <ToggleRight size={18} className="text-primary-500" />
                      ) : (
                        <ToggleLeft size={18} className="text-gray-400" />
                      )}
                    </button>
                    <button
                      onClick={() => openEditProduct(product)}
                      className="p-1.5 hover:bg-gray-100 rounded"
                    >
                      <Edit2 size={16} className="text-gray-400" />
                    </button>
                    <button
                      onClick={() => handleDelete(product)}
                      className="p-1.5 hover:bg-red-50 rounded"
                    >
                      <Trash2 size={16} className="text-red-400" />
                    </button>
                  </div>
                </div>

                {product.description && (
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">{product.description}</p>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <span className="text-lg font-bold text-primary-600">
                    {formatCurrency(product.price)}
                  </span>
                  <div className="text-xs text-gray-500">
                    {product.track_stock ? (
                      <span className={product.stock_qty <= 5 ? 'text-red-500 font-medium' : ''}>
                        Estoque: {product.stock_qty}
                      </span>
                    ) : (
                      <span>Sem estoque</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-fade-in">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingProduct ? 'Editar Produto' : 'Novo Produto'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input
                  type="text"
                  className="input-field"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="Ex: Pizza Margherita"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <textarea
                  className="input-field"
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Ingredientes e detalhes do produto..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Preço *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input-field"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    required
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                  <select
                    className="input-field"
                    value={formData.category_id}
                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  >
                    <option value="">Sem categoria</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.track_stock}
                    onChange={(e) => setFormData({ ...formData, track_stock: e.target.checked })}
                    className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">Controlar estoque</span>
                </label>
                {formData.track_stock && (
                  <div className="flex-1">
                    <input
                      type="number"
                      min="0"
                      className="input-field"
                      value={formData.stock_qty}
                      onChange={(e) => setFormData({ ...formData, stock_qty: e.target.value })}
                      placeholder="Quantidade"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL da imagem (opcional)
                </label>
                <input
                  type="url"
                  className="input-field"
                  value={formData.image_url}
                  onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Produto ativo no cardápio</span>
              </label>

              {/* Variações */}
              <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center gap-2 mb-3">
                  <Layers size={16} className="text-gray-400" />
                  <h3 className="text-sm font-medium text-gray-700">Variações (tamanho, sabor, adicionais...)</h3>
                </div>

                {!editingProduct ? (
                  <p className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
                    Salve o produto primeiro. Depois, clique em "Editar" para adicionar variações.
                  </p>
                ) : loadingVariations ? (
                  <div className="flex justify-center py-4">
                    <Loader2 size={20} className="animate-spin text-primary-500" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {variationGroups.map((group) => (
                      <div key={group.id} className="border border-gray-200 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm text-gray-900">{group.name}</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteGroup(group)}
                            className="p-1 hover:bg-red-50 rounded"
                          >
                            <Trash2 size={14} className="text-red-400" />
                          </button>
                        </div>
                        <div className="flex items-center gap-4 mb-2">
                          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={group.is_required}
                              onChange={() => handleToggleGroupFlag(group, 'is_required')}
                              className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                            />
                            Obrigatório
                          </label>
                          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={group.allow_multiple}
                              onChange={() => handleToggleGroupFlag(group, 'allow_multiple')}
                              className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                            />
                            Permitir múltiplas escolhas
                          </label>
                        </div>

                        <div className="space-y-1.5 mb-2">
                          {group.options.map((option) => (
                            <div key={option.id} className="flex items-center justify-between bg-gray-50 rounded px-2 py-1.5">
                              <span className="text-sm text-gray-700">
                                {option.name}
                                {Number(option.price_delta) > 0 && (
                                  <span className="text-primary-600 ml-1">
                                    (+R$ {Number(option.price_delta).toFixed(2)})
                                  </span>
                                )}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDeleteOption(option)}
                                className="p-0.5 hover:bg-red-50 rounded"
                              >
                                <X size={12} className="text-red-400" />
                              </button>
                            </div>
                          ))}
                        </div>

                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Nome da opção"
                            className="input-field text-sm py-1.5"
                            value={optionDrafts[group.id]?.name || ''}
                            onChange={(e) =>
                              setOptionDrafts({
                                ...optionDrafts,
                                [group.id]: { name: e.target.value, price: optionDrafts[group.id]?.price || '' },
                              })
                            }
                          />
                          <input
                            type="number"
                            step="0.01"
                            placeholder="+R$"
                            className="input-field text-sm py-1.5 w-24"
                            value={optionDrafts[group.id]?.price || ''}
                            onChange={(e) =>
                              setOptionDrafts({
                                ...optionDrafts,
                                [group.id]: { name: optionDrafts[group.id]?.name || '', price: e.target.value },
                              })
                            }
                          />
                          <button
                            type="button"
                            onClick={() => handleAddOption(group)}
                            className="btn-secondary text-sm py-1.5 px-3"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                    ))}

                    <div className="flex gap-2 items-start bg-gray-50 rounded-lg p-3">
                      <div className="flex-1 space-y-2">
                        <input
                          type="text"
                          placeholder="Ex: Tamanho, Sabor, Adicionais"
                          className="input-field text-sm py-1.5"
                          value={newGroupName}
                          onChange={(e) => setNewGroupName(e.target.value)}
                        />
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={newGroupRequired}
                              onChange={(e) => setNewGroupRequired(e.target.checked)}
                              className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                            />
                            Obrigatório
                          </label>
                          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={newGroupMultiple}
                              onChange={(e) => setNewGroupMultiple(e.target.checked)}
                              className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                            />
                            Múltipla escolha
                          </label>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddGroup}
                        disabled={!newGroupName.trim()}
                        className="btn-primary text-sm py-1.5 px-3"
                      >
                        <Plus size={14} />
                        Grupo
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn-secondary flex-1"
                >
                  Cancelar
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={saving}>
                  {saving ? <Loader2 size={18} className="animate-spin" /> : editingProduct ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function Package(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m7.5 4.27 9 5.15" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="M3.3 7 12 12l8.7-5" />
      <path d="M12 22V12" />
    </svg>
  )
}
