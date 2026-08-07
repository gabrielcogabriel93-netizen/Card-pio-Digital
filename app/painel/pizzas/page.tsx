'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { log, logError } from '@/lib/logger'
import { useEscapeKey } from '@/lib/useEscapeKey'
import { ImageUpload } from '@/components/ImageUpload'
import type { Category, PizzaAdditional, PizzaAdditionalPrice, PizzaFlavor, PizzaFlavorPrice, PizzaSize } from '@/types'
import {
  Plus, Edit2, Trash2, X, Loader2, ToggleLeft, ToggleRight, ChevronUp, ChevronDown,
  Pizza as PizzaIcon, Sparkles, Ruler, Layers, Info,
} from 'lucide-react'

type Tab = 'tamanhos' | 'sabores' | 'adicionais'

const MAX_FLAVORS_LABEL: Record<number, string> = {
  1: '1 sabor (não divide)',
  2: 'até 2 sabores (meio a meio)',
  3: 'até 3 sabores',
  4: 'até 4 sabores',
}

export default function PizzasPage() {
  const [establishmentId, setEstablishmentId] = useState('')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('tamanhos')

  const [sizes, setSizes] = useState<PizzaSize[]>([])
  const [flavors, setFlavors] = useState<PizzaFlavor[]>([])
  const [flavorPrices, setFlavorPrices] = useState<PizzaFlavorPrice[]>([])
  const [additionals, setAdditionals] = useState<PizzaAdditional[]>([])
  const [additionalPrices, setAdditionalPrices] = useState<PizzaAdditionalPrice[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [linkedFlavorIds, setLinkedFlavorIds] = useState<Set<string>>(new Set())
  const [maxProductOrder, setMaxProductOrder] = useState(-1)

  const [genCategoryId, setGenCategoryId] = useState('')
  const [generating, setGenerating] = useState(false)

  // Modal: tamanho
  const [showSizeModal, setShowSizeModal] = useState(false)
  const [editingSize, setEditingSize] = useState<PizzaSize | null>(null)
  const [savingSize, setSavingSize] = useState(false)
  const [sizeForm, setSizeForm] = useState({ name: '', base_price: '', max_flavors: '1', is_active: true })

  // Modal: sabor
  const [showFlavorModal, setShowFlavorModal] = useState(false)
  const [editingFlavor, setEditingFlavor] = useState<PizzaFlavor | null>(null)
  const [savingFlavor, setSavingFlavor] = useState(false)
  const [flavorForm, setFlavorForm] = useState({
    name: '', description: '', image_url: '', category: '' as '' | 'salgada' | 'doce', is_active: true,
    deltas: {} as Record<string, string>,
  })

  // Modal: adicional
  const [showAdditionalModal, setShowAdditionalModal] = useState(false)
  const [editingAdditional, setEditingAdditional] = useState<PizzaAdditional | null>(null)
  const [savingAdditional, setSavingAdditional] = useState(false)
  const [additionalForm, setAdditionalForm] = useState({
    name: '', is_active: true, prices: {} as Record<string, string>,
  })

  useEscapeKey(() => {
    setShowSizeModal(false)
    setShowFlavorModal(false)
    setShowAdditionalModal(false)
  }, showSizeModal || showFlavorModal || showAdditionalModal)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    log('painel:pizzas', 'carregando dados de pizza...')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: est, error: estError } = await supabase
        .from('establishments')
        .select('id')
        .eq('owner_id', user.id)
        .single()

      if (estError) logError('painel:pizzas', 'erro ao buscar estabelecimento', estError)
      if (!est) return
      setEstablishmentId(est.id)

      const [sizesRes, flavorsRes, additionalsRes, categoriesRes, productsRes] = await Promise.all([
        supabase.from('pizza_sizes').select('*').eq('establishment_id', est.id).order('display_order'),
        supabase.from('pizza_flavors').select('*').eq('establishment_id', est.id).order('display_order'),
        supabase.from('pizza_additionals').select('*').eq('establishment_id', est.id).order('display_order'),
        supabase.from('categories').select('*').eq('establishment_id', est.id).order('display_order'),
        supabase.from('products').select('id, pizza_flavor_id, display_order').eq('establishment_id', est.id),
      ])

      if (sizesRes.data) setSizes(sizesRes.data)
      if (flavorsRes.data) setFlavors(flavorsRes.data)
      if (additionalsRes.data) setAdditionals(additionalsRes.data)
      if (categoriesRes.data) {
        setCategories(categoriesRes.data)
        setGenCategoryId((prev) => prev || categoriesRes.data.find((c) => c.name.toLowerCase().includes('pizza'))?.id || '')
      }
      if (productsRes.data) {
        setLinkedFlavorIds(new Set(productsRes.data.filter((p) => p.pizza_flavor_id).map((p) => p.pizza_flavor_id as string)))
        setMaxProductOrder(productsRes.data.reduce((max, p) => Math.max(max, p.display_order ?? -1), -1))
      }

      const flavorIds = (flavorsRes.data || []).map((f) => f.id)
      if (flavorIds.length > 0) {
        const { data: prices } = await supabase.from('pizza_flavor_prices').select('*').in('flavor_id', flavorIds)
        if (prices) setFlavorPrices(prices)
      } else {
        setFlavorPrices([])
      }

      const additionalIds = (additionalsRes.data || []).map((a) => a.id)
      if (additionalIds.length > 0) {
        const { data: prices } = await supabase.from('pizza_additional_prices').select('*').in('additional_id', additionalIds)
        if (prices) setAdditionalPrices(prices)
      } else {
        setAdditionalPrices([])
      }
    } catch (error) {
      logError('painel:pizzas', 'exceção ao carregar dados de pizza', error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

  const moveItem = async (
    table: 'pizza_sizes' | 'pizza_flavors' | 'pizza_additionals',
    list: { id: string }[],
    index: number,
    direction: 'up' | 'down'
  ) => {
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= list.length) return
    const updated = [...list]
    const tmp = updated[index]
    updated[index] = updated[newIndex]
    updated[newIndex] = tmp
    try {
      const supabase = createClient()
      for (let i = 0; i < updated.length; i++) {
        await supabase.from(table).update({ display_order: i }).eq('id', updated[i].id)
      }
      await loadData()
    } catch (error) {
      logError('painel:pizzas', `erro ao reordenar ${table}`, error)
    }
  }

  // ============================================================
  // TAMANHOS
  // ============================================================
  const openNewSize = () => {
    setEditingSize(null)
    setSizeForm({ name: '', base_price: '', max_flavors: '1', is_active: true })
    setShowSizeModal(true)
  }

  const openEditSize = (size: PizzaSize) => {
    setEditingSize(size)
    setSizeForm({
      name: size.name,
      base_price: String(size.base_price),
      max_flavors: String(size.max_flavors),
      is_active: size.is_active,
    })
    setShowSizeModal(true)
  }

  const handleSaveSize = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingSize(true)
    try {
      const supabase = createClient()
      const payload = {
        establishment_id: establishmentId,
        name: sizeForm.name.trim(),
        base_price: parseFloat(sizeForm.base_price) || 0,
        max_flavors: parseInt(sizeForm.max_flavors) || 1,
        is_active: sizeForm.is_active,
        display_order: editingSize ? editingSize.display_order : sizes.reduce((max, s) => Math.max(max, s.display_order), -1) + 1,
      }

      if (editingSize) {
        const { error } = await supabase.from('pizza_sizes').update(payload).eq('id', editingSize.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('pizza_sizes').insert(payload)
        if (error) throw error
      }

      log('painel:pizzas', 'tamanho salvo com sucesso')
      await loadData()
      setShowSizeModal(false)
    } catch (error: any) {
      logError('painel:pizzas', 'erro ao salvar tamanho', error)
      alert('Erro ao salvar tamanho: ' + error.message)
    } finally {
      setSavingSize(false)
    }
  }

  const handleDeleteSize = async (size: PizzaSize) => {
    if (!confirm(`Excluir o tamanho "${size.name}"? Isso também remove os preços de sabores e adicionais cadastrados pra esse tamanho.`)) return
    try {
      const supabase = createClient()
      const { error } = await supabase.from('pizza_sizes').delete().eq('id', size.id)
      if (error) throw error
      await loadData()
    } catch (error: any) {
      logError('painel:pizzas', 'erro ao excluir tamanho', error)
      alert('Erro ao excluir: ' + error.message)
    }
  }

  const toggleSizeActive = async (size: PizzaSize) => {
    try {
      const supabase = createClient()
      await supabase.from('pizza_sizes').update({ is_active: !size.is_active }).eq('id', size.id)
      await loadData()
    } catch (error) {
      logError('painel:pizzas', 'erro ao alterar status do tamanho', error)
    }
  }

  // ============================================================
  // SABORES
  // ============================================================
  const openNewFlavor = () => {
    setEditingFlavor(null)
    setFlavorForm({ name: '', description: '', image_url: '', category: '', is_active: true, deltas: {} })
    setShowFlavorModal(true)
  }

  const openEditFlavor = (flavor: PizzaFlavor) => {
    setEditingFlavor(flavor)
    const deltas: Record<string, string> = {}
    sizes.forEach((s) => {
      const fp = flavorPrices.find((p) => p.flavor_id === flavor.id && p.size_id === s.id)
      deltas[s.id] = fp ? String(fp.price_delta) : '0'
    })
    setFlavorForm({
      name: flavor.name,
      description: flavor.description || '',
      image_url: flavor.image_url || '',
      category: (flavor.category as '' | 'salgada' | 'doce') || '',
      is_active: flavor.is_active,
      deltas,
    })
    setShowFlavorModal(true)
  }

  const handleSaveFlavor = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingFlavor(true)
    try {
      const supabase = createClient()
      const payload = {
        establishment_id: establishmentId,
        name: flavorForm.name.trim(),
        description: flavorForm.description.trim() || null,
        image_url: flavorForm.image_url || null,
        category: flavorForm.category || null,
        is_active: flavorForm.is_active,
        display_order: editingFlavor ? editingFlavor.display_order : flavors.reduce((max, f) => Math.max(max, f.display_order), -1) + 1,
      }

      let flavorId = editingFlavor?.id
      if (editingFlavor) {
        const { error } = await supabase.from('pizza_flavors').update(payload).eq('id', editingFlavor.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('pizza_flavors').insert(payload).select().single()
        if (error) throw error
        flavorId = data.id
      }

      if (flavorId && sizes.length > 0) {
        const rows = sizes.map((s) => ({
          flavor_id: flavorId as string,
          size_id: s.id,
          price_delta: parseFloat(flavorForm.deltas[s.id]) || 0,
        }))
        const { error: priceError } = await supabase.from('pizza_flavor_prices').upsert(rows, { onConflict: 'flavor_id,size_id' })
        if (priceError) throw priceError
      }

      log('painel:pizzas', 'sabor salvo com sucesso')
      await loadData()
      setShowFlavorModal(false)
    } catch (error: any) {
      logError('painel:pizzas', 'erro ao salvar sabor', error)
      alert('Erro ao salvar sabor: ' + error.message)
    } finally {
      setSavingFlavor(false)
    }
  }

  const handleDeleteFlavor = async (flavor: PizzaFlavor) => {
    const warning = linkedFlavorIds.has(flavor.id)
      ? `O sabor "${flavor.name}" está vinculado a um produto do catálogo. Excluir o sabor desconecta o produto do sistema de pizza (ele continua existindo, mas sem tamanhos/sabores/adicionais). Excluir mesmo assim?`
      : `Excluir o sabor "${flavor.name}"?`
    if (!confirm(warning)) return
    try {
      const supabase = createClient()
      const { error } = await supabase.from('pizza_flavors').delete().eq('id', flavor.id)
      if (error) throw error
      await loadData()
    } catch (error: any) {
      logError('painel:pizzas', 'erro ao excluir sabor', error)
      alert('Erro ao excluir: ' + error.message)
    }
  }

  const toggleFlavorActive = async (flavor: PizzaFlavor) => {
    try {
      const supabase = createClient()
      await supabase.from('pizza_flavors').update({ is_active: !flavor.is_active }).eq('id', flavor.id)
      await loadData()
    } catch (error) {
      logError('painel:pizzas', 'erro ao alterar status do sabor', error)
    }
  }

  const priceOfFlavorAtSize = (flavorId: string, size: PizzaSize) => {
    const fp = flavorPrices.find((p) => p.flavor_id === flavorId && p.size_id === size.id)
    return Number(size.base_price) + Number(fp?.price_delta || 0)
  }

  // ============================================================
  // ADICIONAIS
  // ============================================================
  const openNewAdditional = () => {
    setEditingAdditional(null)
    const prices: Record<string, string> = {}
    sizes.forEach((s) => { prices[s.id] = '' })
    setAdditionalForm({ name: '', is_active: true, prices })
    setShowAdditionalModal(true)
  }

  const openEditAdditional = (additional: PizzaAdditional) => {
    setEditingAdditional(additional)
    const prices: Record<string, string> = {}
    sizes.forEach((s) => {
      const ap = additionalPrices.find((p) => p.additional_id === additional.id && p.size_id === s.id)
      prices[s.id] = ap ? String(ap.price) : '0'
    })
    setAdditionalForm({ name: additional.name, is_active: additional.is_active, prices })
    setShowAdditionalModal(true)
  }

  const handleSaveAdditional = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingAdditional(true)
    try {
      const supabase = createClient()
      const payload = {
        establishment_id: establishmentId,
        name: additionalForm.name.trim(),
        is_active: additionalForm.is_active,
        display_order: editingAdditional ? editingAdditional.display_order : additionals.reduce((max, a) => Math.max(max, a.display_order), -1) + 1,
      }

      let additionalId = editingAdditional?.id
      if (editingAdditional) {
        const { error } = await supabase.from('pizza_additionals').update(payload).eq('id', editingAdditional.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('pizza_additionals').insert(payload).select().single()
        if (error) throw error
        additionalId = data.id
      }

      if (additionalId && sizes.length > 0) {
        const rows = sizes.map((s) => ({
          additional_id: additionalId as string,
          size_id: s.id,
          price: parseFloat(additionalForm.prices[s.id]) || 0,
        }))
        const { error: priceError } = await supabase.from('pizza_additional_prices').upsert(rows, { onConflict: 'additional_id,size_id' })
        if (priceError) throw priceError
      }

      log('painel:pizzas', 'adicional salvo com sucesso')
      await loadData()
      setShowAdditionalModal(false)
    } catch (error: any) {
      logError('painel:pizzas', 'erro ao salvar adicional', error)
      alert('Erro ao salvar adicional: ' + error.message)
    } finally {
      setSavingAdditional(false)
    }
  }

  const handleDeleteAdditional = async (additional: PizzaAdditional) => {
    if (!confirm(`Excluir o adicional "${additional.name}"?`)) return
    try {
      const supabase = createClient()
      const { error } = await supabase.from('pizza_additionals').delete().eq('id', additional.id)
      if (error) throw error
      await loadData()
    } catch (error: any) {
      logError('painel:pizzas', 'erro ao excluir adicional', error)
      alert('Erro ao excluir: ' + error.message)
    }
  }

  const toggleAdditionalActive = async (additional: PizzaAdditional) => {
    try {
      const supabase = createClient()
      await supabase.from('pizza_additionals').update({ is_active: !additional.is_active }).eq('id', additional.id)
      await loadData()
    } catch (error) {
      logError('painel:pizzas', 'erro ao alterar status do adicional', error)
    }
  }

  // ============================================================
  // GERAR PRODUTOS PENDENTES
  // ============================================================
  const pendingFlavors = flavors.filter((f) => f.is_active && !linkedFlavorIds.has(f.id))

  const handleGeneratePendingProducts = async () => {
    if (pendingFlavors.length === 0) {
      alert('Nenhum sabor novo pra gerar — todos os sabores ativos já têm um produto no catálogo.')
      return
    }
    if (!confirm(
      `Gerar ${pendingFlavors.length} produto(s), um por sabor? Eles entram INATIVOS pra você revisar (foto, descrição, categoria) antes de publicar no cardápio.`
    )) return

    setGenerating(true)
    try {
      const supabase = createClient()
      const activeSizes = sizes.filter((s) => s.is_active)
      const rows = pendingFlavors.map((f, i) => {
        const prices = activeSizes.map((s) => priceOfFlavorAtSize(f.id, s))
        return {
          establishment_id: establishmentId,
          category_id: genCategoryId || null,
          name: f.name,
          description: f.description || null,
          price: prices.length > 0 ? Math.min(...prices) : 0,
          image_url: f.image_url || null,
          is_active: false,
          // Estoque de pizza não faz sentido controlar por "unidade do produto"
          // (o que acaba é ingrediente, não "a pizza X") — sem controle de estoque.
          track_stock: false,
          stock_qty: 0,
          pizza_flavor_id: f.id,
          display_order: maxProductOrder + 1 + i,
        }
      })

      const { error } = await supabase.from('products').insert(rows)
      if (error) throw error

      log('painel:pizzas', 'produtos de pizza gerados', { total: rows.length })
      alert(`${rows.length} produto(s) gerado(s) como pendente! Vá em Produtos pra revisar e ativar.`)
      await loadData()
    } catch (error: any) {
      logError('painel:pizzas', 'erro ao gerar produtos pendentes', error)
      alert('Erro ao gerar produtos: ' + error.message)
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-primary-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <PizzaIcon size={24} className="text-primary-500" />
          Pizzas
        </h1>
        <p className="text-gray-600 mt-1">
          Cadastre os tamanhos, os sabores (com acréscimo por tamanho) e os adicionais. Depois, gere um
          produto pra cada sabor com um clique.
        </p>
      </div>

      {/* Gerar produtos pendentes */}
      <div className="card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Sparkles size={20} className="text-primary-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-gray-900">Gerar produtos a partir dos sabores</p>
            <p className="text-sm text-gray-500">
              {pendingFlavors.length > 0
                ? `${pendingFlavors.length} sabor(es) ainda sem produto no catálogo.`
                : 'Todos os sabores ativos já têm um produto.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="input-field sm:w-48"
            value={genCategoryId}
            onChange={(e) => setGenCategoryId(e.target.value)}
            aria-label="Categoria para os produtos gerados"
          >
            <option value="">Sem categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button
            onClick={handleGeneratePendingProducts}
            disabled={generating || pendingFlavors.length === 0}
            className="btn-primary whitespace-nowrap"
          >
            {generating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            Gerar {pendingFlavors.length > 0 ? `(${pendingFlavors.length})` : ''}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { id: 'tamanhos' as Tab, label: 'Tamanhos', icon: Ruler },
          { id: 'sabores' as Tab, label: 'Sabores', icon: PizzaIcon },
          { id: 'adicionais' as Tab, label: 'Adicionais', icon: Layers },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {/* TAMANHOS */}
      {tab === 'tamanhos' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={openNewSize} className="btn-primary">
              <Plus size={18} />
              Novo Tamanho
            </button>
          </div>

          {sizes.length === 0 ? (
            <div className="card text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Ruler size={32} className="text-gray-400" />
              </div>
              <p className="text-gray-600 mb-2">Comece por aqui: cadastre os tamanhos.</p>
              <p className="text-sm text-gray-500 mb-4 max-w-md mx-auto">
                Ex: Pequena, Média, Grande, Família. Use o preço do seu sabor mais tradicional como
                referência — os demais sabores só vão ter um acréscimo (se houver) sobre esse valor.
              </p>
              <button onClick={openNewSize} className="btn-primary">
                <Plus size={18} />
                Cadastrar primeiro tamanho
              </button>
            </div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <div className="divide-y divide-gray-100">
                {sizes.map((size, index) => (
                  <div key={size.id} className={`flex items-center justify-between p-4 ${!size.is_active ? 'opacity-60' : ''}`}>
                    <div>
                      <p className="font-medium text-gray-900">{size.name}</p>
                      <p className="text-sm text-gray-500">
                        {formatCurrency(Number(size.base_price))} · {MAX_FLAVORS_LABEL[size.max_flavors] || `até ${size.max_flavors} sabores`}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => moveItem('pizza_sizes', sizes, index, 'up')} disabled={index === 0} className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30" aria-label="Mover para cima">
                        <ChevronUp size={16} className="text-gray-400" />
                      </button>
                      <button onClick={() => moveItem('pizza_sizes', sizes, index, 'down')} disabled={index === sizes.length - 1} className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30" aria-label="Mover para baixo">
                        <ChevronDown size={16} className="text-gray-400" />
                      </button>
                      <button onClick={() => toggleSizeActive(size)} className="p-1.5 hover:bg-gray-100 rounded" aria-label={size.is_active ? 'Desativar' : 'Ativar'}>
                        {size.is_active ? <ToggleRight size={18} className="text-primary-500" /> : <ToggleLeft size={18} className="text-gray-400" />}
                      </button>
                      <button onClick={() => openEditSize(size)} className="p-1.5 hover:bg-gray-100 rounded" aria-label="Editar tamanho">
                        <Edit2 size={16} className="text-gray-400" />
                      </button>
                      <button onClick={() => handleDeleteSize(size)} className="p-1.5 hover:bg-red-50 rounded" aria-label="Excluir tamanho">
                        <Trash2 size={16} className="text-red-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SABORES */}
      {tab === 'sabores' && (
        <div className="space-y-4">
          {sizes.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-700 flex items-start gap-2">
              <Info size={16} className="flex-shrink-0 mt-0.5" />
              Cadastre os tamanhos primeiro, na aba &quot;Tamanhos&quot; — assim dá pra definir o acréscimo de cada
              sabor por tamanho.
            </div>
          )}
          <div className="flex justify-end">
            <button onClick={openNewFlavor} className="btn-primary">
              <Plus size={18} />
              Novo Sabor
            </button>
          </div>

          {flavors.length === 0 ? (
            <div className="card text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <PizzaIcon size={32} className="text-gray-400" />
              </div>
              <p className="text-gray-600 mb-2">Nenhum sabor cadastrado.</p>
              <p className="text-sm text-gray-500 mb-4 max-w-md mx-auto">
                Cadastre primeiro o sabor mais tradicional da casa (o que definiu o preço dos tamanhos), depois
                os demais — se algum tiver acréscimo, é só informar por tamanho.
              </p>
              <button onClick={openNewFlavor} className="btn-primary">
                <Plus size={18} />
                Cadastrar primeiro sabor
              </button>
            </div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <div className="divide-y divide-gray-100">
                {flavors.map((flavor, index) => (
                  <div key={flavor.id} className={`flex items-center justify-between p-4 gap-3 ${!flavor.is_active ? 'opacity-60' : ''}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      {flavor.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={flavor.image_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <PizzaIcon size={18} className="text-gray-400" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{flavor.name}</p>
                        <p className="text-xs text-gray-500 flex items-center gap-1.5 flex-wrap">
                          {flavor.category && <span className="capitalize">{flavor.category}</span>}
                          {!linkedFlavorIds.has(flavor.id) && (
                            <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">sem produto ainda</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button onClick={() => moveItem('pizza_flavors', flavors, index, 'up')} disabled={index === 0} className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30" aria-label="Mover para cima">
                        <ChevronUp size={16} className="text-gray-400" />
                      </button>
                      <button onClick={() => moveItem('pizza_flavors', flavors, index, 'down')} disabled={index === flavors.length - 1} className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30" aria-label="Mover para baixo">
                        <ChevronDown size={16} className="text-gray-400" />
                      </button>
                      <button onClick={() => toggleFlavorActive(flavor)} className="p-1.5 hover:bg-gray-100 rounded" aria-label={flavor.is_active ? 'Desativar' : 'Ativar'}>
                        {flavor.is_active ? <ToggleRight size={18} className="text-primary-500" /> : <ToggleLeft size={18} className="text-gray-400" />}
                      </button>
                      <button onClick={() => openEditFlavor(flavor)} className="p-1.5 hover:bg-gray-100 rounded" aria-label="Editar sabor">
                        <Edit2 size={16} className="text-gray-400" />
                      </button>
                      <button onClick={() => handleDeleteFlavor(flavor)} className="p-1.5 hover:bg-red-50 rounded" aria-label="Excluir sabor">
                        <Trash2 size={16} className="text-red-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ADICIONAIS */}
      {tab === 'adicionais' && (
        <div className="space-y-4">
          {sizes.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-700 flex items-start gap-2">
              <Info size={16} className="flex-shrink-0 mt-0.5" />
              Cadastre os tamanhos primeiro — o preço de cada adicional é definido por tamanho.
            </div>
          )}
          <div className="flex justify-end">
            <button onClick={openNewAdditional} className="btn-primary">
              <Plus size={18} />
              Novo Adicional
            </button>
          </div>

          {additionals.length === 0 ? (
            <div className="card text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Layers size={32} className="text-gray-400" />
              </div>
              <p className="text-gray-600 mb-2">Nenhum adicional cadastrado.</p>
              <p className="text-sm text-gray-500 mb-4 max-w-md mx-auto">
                Ex: Borda recheada, queijo extra, azeitona. O preço pode variar por tamanho.
              </p>
              <button onClick={openNewAdditional} className="btn-primary">
                <Plus size={18} />
                Cadastrar primeiro adicional
              </button>
            </div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <div className="divide-y divide-gray-100">
                {additionals.map((additional, index) => (
                  <div key={additional.id} className={`flex items-center justify-between p-4 gap-3 ${!additional.is_active ? 'opacity-60' : ''}`}>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{additional.name}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {sizes.map((s) => {
                          const ap = additionalPrices.find((p) => p.additional_id === additional.id && p.size_id === s.id)
                          return `${s.name}: ${formatCurrency(Number(ap?.price || 0))}`
                        }).join(' · ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button onClick={() => moveItem('pizza_additionals', additionals, index, 'up')} disabled={index === 0} className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30" aria-label="Mover para cima">
                        <ChevronUp size={16} className="text-gray-400" />
                      </button>
                      <button onClick={() => moveItem('pizza_additionals', additionals, index, 'down')} disabled={index === additionals.length - 1} className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30" aria-label="Mover para baixo">
                        <ChevronDown size={16} className="text-gray-400" />
                      </button>
                      <button onClick={() => toggleAdditionalActive(additional)} className="p-1.5 hover:bg-gray-100 rounded" aria-label={additional.is_active ? 'Desativar' : 'Ativar'}>
                        {additional.is_active ? <ToggleRight size={18} className="text-primary-500" /> : <ToggleLeft size={18} className="text-gray-400" />}
                      </button>
                      <button onClick={() => openEditAdditional(additional)} className="p-1.5 hover:bg-gray-100 rounded" aria-label="Editar adicional">
                        <Edit2 size={16} className="text-gray-400" />
                      </button>
                      <button onClick={() => handleDeleteAdditional(additional)} className="p-1.5 hover:bg-red-50 rounded" aria-label="Excluir adicional">
                        <Trash2 size={16} className="text-red-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal: Tamanho */}
      {showSizeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowSizeModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md animate-fade-in">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">{editingSize ? 'Editar Tamanho' : 'Novo Tamanho'}</h2>
              <button onClick={() => setShowSizeModal(false)} className="p-1 hover:bg-gray-100 rounded" aria-label="Fechar">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveSize} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input type="text" className="input-field" value={sizeForm.name} onChange={(e) => setSizeForm({ ...sizeForm, name: e.target.value })} required autoFocus placeholder="Ex: Grande (8 fatias)" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Valor do tamanho (com o sabor principal) *
                </label>
                <input type="number" step="0.01" min="0" className="input-field" value={sizeForm.base_price} onChange={(e) => setSizeForm({ ...sizeForm, base_price: e.target.value })} required placeholder="0,00" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantos sabores esse tamanho aceita?</label>
                <select className="input-field" value={sizeForm.max_flavors} onChange={(e) => setSizeForm({ ...sizeForm, max_flavors: e.target.value })}>
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>{MAX_FLAVORS_LABEL[n]}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={sizeForm.is_active} onChange={(e) => setSizeForm({ ...sizeForm, is_active: e.target.checked })} className="rounded border-gray-300 text-primary-500 focus:ring-primary-500" />
                <span className="text-sm text-gray-700">Tamanho ativo (aparece pro cliente)</span>
              </label>
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button type="button" onClick={() => setShowSizeModal(false)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" className="btn-primary flex-1" disabled={savingSize}>
                  {savingSize ? <Loader2 size={18} className="animate-spin" /> : editingSize ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Sabor */}
      {showFlavorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowFlavorModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-fade-in">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h2 className="text-lg font-semibold text-gray-900">{editingFlavor ? 'Editar Sabor' : 'Novo Sabor'}</h2>
              <button onClick={() => setShowFlavorModal(false)} className="p-1 hover:bg-gray-100 rounded" aria-label="Fechar">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveFlavor} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do sabor *</label>
                <input type="text" className="input-field" value={flavorForm.name} onChange={(e) => setFlavorForm({ ...flavorForm, name: e.target.value })} required autoFocus placeholder="Ex: Calabresa" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição (ingredientes)</label>
                <textarea className="input-field" rows={2} value={flavorForm.description} onChange={(e) => setFlavorForm({ ...flavorForm, description: e.target.value })} placeholder="Molho de tomate, calabresa fatiada, cebola..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria (opcional)</label>
                <select className="input-field" value={flavorForm.category} onChange={(e) => setFlavorForm({ ...flavorForm, category: e.target.value as any })}>
                  <option value="">Nenhuma (combina com qualquer sabor)</option>
                  <option value="salgada">Salgada</option>
                  <option value="doce">Doce</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Ao montar meio a meio, só sugerimos sabores da mesma categoria — evita combinações como
                  calabresa + chocolate.
                </p>
              </div>

              <ImageUpload
                label="Foto do sabor (opcional)"
                value={flavorForm.image_url}
                onChange={(url) => setFlavorForm({ ...flavorForm, image_url: url })}
                establishmentId={establishmentId}
                folder="pizza-flavors"
              />

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={flavorForm.is_active} onChange={(e) => setFlavorForm({ ...flavorForm, is_active: e.target.checked })} className="rounded border-gray-300 text-primary-500 focus:ring-primary-500" />
                <span className="text-sm text-gray-700">Sabor ativo (pode ser escolhido pelo cliente)</span>
              </label>

              {sizes.length > 0 && (
                <div className="pt-4 border-t border-gray-200">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Acréscimo por tamanho</h3>
                  <p className="text-xs text-gray-500 mb-3">
                    Deixe 0 se esse sabor custa o mesmo que o tamanho já vale. Se ele for mais caro (ex:
                    camarão), informe quanto acrescenta.
                  </p>
                  <div className="space-y-2">
                    {sizes.map((size) => {
                      const delta = parseFloat(flavorForm.deltas[size.id]) || 0
                      return (
                        <div key={size.id} className="flex items-center gap-3">
                          <span className="text-sm text-gray-700 flex-1">{size.name}</span>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-400">+R$</span>
                            <input
                              type="number"
                              step="0.01"
                              className="input-field w-24 text-sm py-1.5"
                              value={flavorForm.deltas[size.id] ?? '0'}
                              onChange={(e) => setFlavorForm({ ...flavorForm, deltas: { ...flavorForm.deltas, [size.id]: e.target.value } })}
                            />
                          </div>
                          <span className="text-xs text-gray-500 w-24 text-right">
                            = {formatCurrency(Number(size.base_price) + delta)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button type="button" onClick={() => setShowFlavorModal(false)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" className="btn-primary flex-1" disabled={savingFlavor}>
                  {savingFlavor ? <Loader2 size={18} className="animate-spin" /> : editingFlavor ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Adicional */}
      {showAdditionalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowAdditionalModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-fade-in">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h2 className="text-lg font-semibold text-gray-900">{editingAdditional ? 'Editar Adicional' : 'Novo Adicional'}</h2>
              <button onClick={() => setShowAdditionalModal(false)} className="p-1 hover:bg-gray-100 rounded" aria-label="Fechar">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveAdditional} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input type="text" className="input-field" value={additionalForm.name} onChange={(e) => setAdditionalForm({ ...additionalForm, name: e.target.value })} required autoFocus placeholder="Ex: Borda recheada catupiry" />
              </div>

              {sizes.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Preço por tamanho</h3>
                  <div className="space-y-2">
                    {sizes.map((size) => (
                      <div key={size.id} className="flex items-center gap-3">
                        <span className="text-sm text-gray-700 flex-1">{size.name}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-400">R$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="input-field w-24 text-sm py-1.5"
                            value={additionalForm.prices[size.id] ?? ''}
                            onChange={(e) => setAdditionalForm({ ...additionalForm, prices: { ...additionalForm.prices, [size.id]: e.target.value } })}
                            placeholder="0,00"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={additionalForm.is_active} onChange={(e) => setAdditionalForm({ ...additionalForm, is_active: e.target.checked })} className="rounded border-gray-300 text-primary-500 focus:ring-primary-500" />
                <span className="text-sm text-gray-700">Adicional ativo</span>
              </label>

              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button type="button" onClick={() => setShowAdditionalModal(false)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" className="btn-primary flex-1" disabled={savingAdditional}>
                  {savingAdditional ? <Loader2 size={18} className="animate-spin" /> : editingAdditional ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
