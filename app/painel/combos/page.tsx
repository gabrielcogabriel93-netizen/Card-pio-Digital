'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { log, logError } from '@/lib/logger'
import { ImageUpload } from '@/components/ImageUpload'
import { useEscapeKey } from '@/lib/useEscapeKey'
import type { Combo, ComboGroup, Product, PizzaSize } from '@/types'
import { Plus, Edit2, Trash2, ChevronDown, ChevronUp, X, Loader2, ToggleLeft, ToggleRight, Layers, Info, Package } from 'lucide-react'

type GroupWithProducts = ComboGroup & { productIds: string[] }

export default function CombosPage() {
  const [combos, setCombos] = useState<Combo[]>([])
  const [establishmentId, setEstablishmentId] = useState('')
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([])
  const [pizzaSizes, setPizzaSizes] = useState<PizzaSize[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingCombo, setEditingCombo] = useState<Combo | null>(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({ name: '', description: '', image_url: '', price: '', is_active: false })

  // Grupos do combo em edição -- só existem depois do combo ter um id
  // (primeiro save), igual o editor de variation_groups em produtos.
  const [groups, setGroups] = useState<GroupWithProducts[]>([])
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupIsPizza, setNewGroupIsPizza] = useState(false)
  const [newGroupSizeId, setNewGroupSizeId] = useState('')
  const [groupProductSearch, setGroupProductSearch] = useState<Record<string, string>>({})

  useEffect(() => {
    loadData()
  }, [])

  useEscapeKey(() => setShowModal(false), showModal)

  const loadData = async () => {
    log('painel:combos', 'carregando combos...')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: est, error: estError } = await supabase
        .from('establishments')
        .select('id')
        .eq('owner_id', user.id)
        .single()

      if (estError) logError('painel:combos', 'erro ao buscar estabelecimento', estError)
      if (!est) return
      setEstablishmentId(est.id)

      const [combosRes, productsRes, sizesRes] = await Promise.all([
        supabase.from('combos').select('*').eq('establishment_id', est.id).order('display_order'),
        supabase.from('products').select('*').eq('establishment_id', est.id).eq('is_active', true).order('name'),
        supabase.from('pizza_sizes').select('*').eq('establishment_id', est.id).eq('is_active', true).order('display_order'),
      ])

      if (combosRes.error) logError('painel:combos', 'erro ao carregar combos', combosRes.error)
      if (combosRes.data) setCombos(combosRes.data)
      if (productsRes.error) logError('painel:combos', 'erro ao carregar produtos', productsRes.error)
      if (productsRes.data) setCatalogProducts(productsRes.data)
      if (sizesRes.error) logError('painel:combos', 'erro ao carregar tamanhos de pizza', sizesRes.error)
      if (sizesRes.data) setPizzaSizes(sizesRes.data)
    } catch (error) {
      logError('painel:combos', 'exceção ao carregar dados', error)
    } finally {
      setLoading(false)
    }
  }

  const loadGroups = async (comboId: string) => {
    setLoadingGroups(true)
    try {
      const supabase = createClient()
      const { data: groupsData, error: groupsError } = await supabase
        .from('combo_groups')
        .select('*')
        .eq('combo_id', comboId)
        .order('display_order')
      if (groupsError) throw groupsError

      const groupIds = (groupsData || []).map((g) => g.id)
      let links: { combo_group_id: string; product_id: string }[] = []
      if (groupIds.length > 0) {
        const { data, error } = await supabase
          .from('combo_group_products')
          .select('combo_group_id, product_id')
          .in('combo_group_id', groupIds)
        if (error) throw error
        links = data || []
      }

      setGroups(
        (groupsData || []).map((g) => ({
          ...g,
          productIds: links.filter((l) => l.combo_group_id === g.id).map((l) => l.product_id),
        }))
      )
    } catch (error: any) {
      logError('painel:combos', 'erro ao carregar grupos do combo', error)
      alert('Erro ao carregar grupos do combo: ' + error.message)
    } finally {
      setLoadingGroups(false)
    }
  }

  const openNew = () => {
    setEditingCombo(null)
    setFormData({ name: '', description: '', image_url: '', price: '', is_active: false })
    setGroups([])
    setShowModal(true)
  }

  const openEdit = (combo: Combo) => {
    setEditingCombo(combo)
    setFormData({
      name: combo.name,
      description: combo.description || '',
      image_url: combo.image_url || '',
      price: String(combo.price),
      is_active: combo.is_active,
    })
    setShowModal(true)
    loadGroups(combo.id)
  }

  const validateReadyToActivate = (): string | null => {
    if (groups.length === 0) return 'Adicione pelo menos um grupo antes de ativar o combo.'
    for (const g of groups) {
      if (g.productIds.length === 0) return `O grupo "${g.name}" precisa ter pelo menos um produto elegível.`
      if (g.is_pizza_slot && !g.fixed_pizza_size_id) return `O grupo "${g.name}" é um slot de pizza e precisa de um tamanho fixo definido.`
    }
    return null
  }

  const handleSaveCombo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (formData.is_active) {
      const problem = validateReadyToActivate()
      if (problem) {
        alert(problem)
        return
      }
    }

    setSaving(true)
    try {
      const supabase = createClient()
      const payload = {
        establishment_id: establishmentId,
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        image_url: formData.image_url || null,
        price: parseFloat(formData.price) || 0,
        is_active: formData.is_active,
        display_order: editingCombo ? editingCombo.display_order : combos.reduce((max, c) => Math.max(max, c.display_order), -1) + 1,
      }

      if (editingCombo) {
        const { error } = await supabase.from('combos').update(payload).eq('id', editingCombo.id)
        if (error) throw error
        log('painel:combos', 'combo atualizado')
      } else {
        const { data, error } = await supabase.from('combos').insert(payload).select().single()
        if (error) throw error
        log('painel:combos', 'combo criado, liberando edição de grupos')
        setEditingCombo(data)
        setGroups([])
      }

      await loadData()
    } catch (error: any) {
      logError('painel:combos', 'erro ao salvar combo', error)
      alert('Erro ao salvar combo: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteCombo = async (combo: Combo) => {
    if (!confirm(`Excluir o combo "${combo.name}"? Isso remove todos os grupos e vínculos de produtos dele.`)) return
    try {
      const supabase = createClient()
      const { error } = await supabase.from('combos').delete().eq('id', combo.id)
      if (error) throw error
      await loadData()
    } catch (error: any) {
      logError('painel:combos', 'erro ao excluir combo', error)
      alert('Erro ao excluir combo: ' + error.message)
    }
  }

  // Ativar exige validar que todo grupo já tem produto elegível --
  // busca fresca porque essa lista pode ser alternada direto do card,
  // sem abrir o modal de edição (onde os grupos já estariam carregados).
  const toggleActive = async (combo: Combo) => {
    try {
      const supabase = createClient()

      if (!combo.is_active) {
        const { data: groupsData, error: groupsError } = await supabase
          .from('combo_groups')
          .select('id, name, is_pizza_slot, fixed_pizza_size_id, combo_group_products(count)')
          .eq('combo_id', combo.id)
        if (groupsError) throw groupsError

        if (!groupsData || groupsData.length === 0) {
          alert('Adicione pelo menos um grupo antes de ativar o combo.')
          return
        }
        for (const g of groupsData as unknown as { name: string; is_pizza_slot: boolean; fixed_pizza_size_id: string | null; combo_group_products: { count: number }[] }[]) {
          const count = g.combo_group_products?.[0]?.count ?? 0
          if (count === 0) {
            alert(`O grupo "${g.name}" precisa ter pelo menos um produto elegível.`)
            return
          }
          if (g.is_pizza_slot && !g.fixed_pizza_size_id) {
            alert(`O grupo "${g.name}" é um slot de pizza e precisa de um tamanho fixo definido.`)
            return
          }
        }
      }

      const { error } = await supabase.from('combos').update({ is_active: !combo.is_active }).eq('id', combo.id)
      if (error) throw error
      await loadData()
    } catch (error: any) {
      logError('painel:combos', 'erro ao alterar status do combo', error)
      alert('Erro ao alterar status: ' + error.message)
    }
  }

  const moveCombo = async (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= combos.length) return
    const updated = [...combos]
    const tmp = updated[index]
    updated[index] = updated[newIndex]
    updated[newIndex] = tmp
    try {
      const supabase = createClient()
      for (let i = 0; i < updated.length; i++) {
        const { error } = await supabase.from('combos').update({ display_order: i }).eq('id', updated[i].id)
        if (error) throw error
      }
      await loadData()
    } catch (error: any) {
      logError('painel:combos', 'erro ao reordenar combos', error)
      alert('Erro ao reordenar: ' + error.message)
    }
  }

  const handleAddGroup = async () => {
    if (!editingCombo || !newGroupName.trim()) return
    if (newGroupIsPizza && !newGroupSizeId) {
      alert('Escolha o tamanho fixo da pizza para este grupo.')
      return
    }
    try {
      const supabase = createClient()
      const maxOrder = groups.reduce((max, g) => Math.max(max, g.display_order), -1)
      const { error } = await supabase.from('combo_groups').insert({
        combo_id: editingCombo.id,
        name: newGroupName.trim(),
        display_order: maxOrder + 1,
        is_pizza_slot: newGroupIsPizza,
        fixed_pizza_size_id: newGroupIsPizza ? newGroupSizeId : null,
      })
      if (error) throw error

      setNewGroupName('')
      setNewGroupIsPizza(false)
      setNewGroupSizeId('')
      await loadGroups(editingCombo.id)
    } catch (error: any) {
      logError('painel:combos', 'erro ao criar grupo', error)
      alert('Erro ao criar grupo: ' + error.message)
    }
  }

  const handleDeleteGroup = async (group: GroupWithProducts) => {
    if (!editingCombo) return
    if (!confirm(`Excluir o grupo "${group.name}"?`)) return
    try {
      const supabase = createClient()
      const { error } = await supabase.from('combo_groups').delete().eq('id', group.id)
      if (error) throw error
      await loadGroups(editingCombo.id)
    } catch (error: any) {
      logError('painel:combos', 'erro ao excluir grupo', error)
      alert('Erro ao excluir grupo: ' + error.message)
    }
  }

  const handleToggleGroupProduct = async (group: GroupWithProducts, productId: string) => {
    if (!editingCombo) return
    const isSelected = group.productIds.includes(productId)
    try {
      const supabase = createClient()
      if (isSelected) {
        const { error } = await supabase
          .from('combo_group_products')
          .delete()
          .eq('combo_group_id', group.id)
          .eq('product_id', productId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('combo_group_products').insert({ combo_group_id: group.id, product_id: productId })
        if (error) throw error
      }
      await loadGroups(editingCombo.id)
    } catch (error: any) {
      logError('painel:combos', 'erro ao atualizar produtos do grupo', error)
      alert('Erro ao atualizar produtos do grupo: ' + error.message)
    }
  }

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Combos</h1>
          <p className="text-gray-600 mt-1">Monte kits com produtos do seu catálogo por um preço fixo.</p>
        </div>
        <button onClick={openNew} className="btn-primary">
          <Plus size={18} />
          Novo Combo
        </button>
      </div>

      <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 text-sm text-primary-800">
        <div className="flex items-start gap-2 mb-2">
          <Info size={16} className="flex-shrink-0 mt-0.5" />
          <p className="font-medium">Como funciona</p>
        </div>
        <ul className="space-y-1.5 pl-6 list-disc marker:text-primary-400">
          <li>
            <strong>Pra você:</strong> crie o combo com um preço fixo (ex: R$ 49,90) e monte &quot;grupos de escolha&quot; —
            cada grupo é uma etapa que o cliente preenche, com o nome que você quiser (ex: &quot;Escolha o sabor&quot;,
            &quot;Escolha a sobremesa&quot;, &quot;Escolha a bebida&quot;). Em cada grupo, marque quais produtos do seu catálogo
            entram como opção — serve pra qualquer tipo de negócio, não só comida.
          </li>
          <li>
            <strong>Pro seu cliente:</strong> o combo aparece numa aba própria &quot;Combos&quot; no cardápio. Ele escolhe 1
            opção de cada grupo e paga sempre o preço fixo do combo — não importa o que ele escolher, o valor não muda.
          </li>
          <li>Se você vende pizza, pode marcar um grupo como &quot;slot de pizza&quot;: o cliente escolhe só o sabor, o tamanho já vem fixo (definido por você).</li>
          <li>O combo só pode ser ativado depois que todo grupo tiver pelo menos 1 produto elegível.</li>
        </ul>
      </div>

      {combos.length === 0 ? (
        <div className="card text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Layers size={32} className="text-gray-400" />
          </div>
          <p className="text-gray-600 mb-2">Nenhum combo cadastrado.</p>
          <p className="text-sm text-gray-500 mb-4 max-w-md mx-auto">
            Crie seu primeiro combo pra vender kits de produtos com um preço fixo.
          </p>
          <button onClick={openNew} className="btn-primary inline-flex">
            <Plus size={18} />
            Novo Combo
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {combos.map((combo, index) => (
            <div key={combo.id} className="card">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3 min-w-0">
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
                    <p className="text-primary-600 font-medium">{formatCurrency(Number(combo.price))}</p>
                  </div>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ${combo.is_active ? 'bg-primary-50 text-primary-700' : 'bg-gray-100 text-gray-500'}`}>
                  {combo.is_active ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              {combo.description && <p className="text-sm text-gray-500 mb-3 line-clamp-2">{combo.description}</p>}
              <div className="flex items-center gap-1 justify-end">
                <button onClick={() => moveCombo(index, 'up')} disabled={index === 0} className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30" aria-label="Mover para cima">
                  <ChevronUp size={16} />
                </button>
                <button onClick={() => moveCombo(index, 'down')} disabled={index === combos.length - 1} className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30" aria-label="Mover para baixo">
                  <ChevronDown size={16} />
                </button>
                <button onClick={() => toggleActive(combo)} className="p-1.5 hover:bg-gray-100 rounded" aria-label={combo.is_active ? 'Desativar' : 'Ativar'}>
                  {combo.is_active ? <ToggleRight size={18} className="text-primary-500" /> : <ToggleLeft size={18} className="text-gray-400" />}
                </button>
                <button onClick={() => openEdit(combo)} className="p-1.5 hover:bg-gray-100 rounded" aria-label="Editar">
                  <Edit2 size={16} className="text-gray-500" />
                </button>
                <button onClick={() => handleDeleteCombo(combo)} className="p-1.5 hover:bg-red-50 rounded" aria-label="Excluir">
                  <Trash2 size={16} className="text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-in">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-lg font-semibold text-gray-900">{editingCombo ? 'Editar Combo' : 'Novo Combo'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded" aria-label="Fechar">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveCombo} className="p-6 space-y-4 border-b border-gray-200">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input
                  type="text"
                  className="input-field"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Combo Família"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <textarea
                  className="input-field"
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Ex: 1 pizza grande + sobremesa + bebida"
                />
              </div>
              <ImageUpload
                value={formData.image_url}
                onChange={(url) => setFormData({ ...formData, image_url: url })}
                establishmentId={establishmentId}
                folder="combos"
                label="Imagem do combo"
              />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Preço fixo *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input-field"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="0,00"
                    required
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700">Combo ativo</span>
                  </label>
                </div>
              </div>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? <Loader2 size={18} className="animate-spin" /> : editingCombo ? 'Salvar dados do combo' : 'Criar combo e continuar'}
              </button>
            </form>

            {!editingCombo ? (
              <div className="p-6 text-sm text-gray-500">
                Salve os dados acima primeiro — depois você monta os grupos de escolha (sabor, sobremesa, bebida, o que
                fizer sentido pro seu negócio) aqui embaixo.
              </div>
            ) : (
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Layers size={16} className="text-gray-400" />
                  <h3 className="text-sm font-medium text-gray-700">Grupos de escolha</h3>
                </div>

                {loadingGroups ? (
                  <div className="flex justify-center py-4">
                    <Loader2 size={20} className="animate-spin text-primary-500" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {groups.map((group) => {
                      const eligibleProducts = group.is_pizza_slot
                        ? catalogProducts.filter((p) => !!p.pizza_flavor_id)
                        : catalogProducts
                      const search = (groupProductSearch[group.id] || '').toLowerCase()
                      const visibleProducts = search
                        ? eligibleProducts.filter((p) => p.name.toLowerCase().includes(search))
                        : eligibleProducts

                      return (
                        <div key={group.id} className="border border-gray-200 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2 gap-2">
                            <div className="min-w-0">
                              <span className="font-medium text-sm text-gray-900">{group.name}</span>
                              {group.is_pizza_slot && (
                                <span className="ml-2 text-xs bg-sky-50 text-sky-700 px-2 py-0.5 rounded-full whitespace-nowrap">
                                  Slot de pizza — tamanho fixo: {pizzaSizes.find((s) => s.id === group.fixed_pizza_size_id)?.name || '—'}
                                </span>
                              )}
                            </div>
                            <button type="button" onClick={() => handleDeleteGroup(group)} className="p-1 hover:bg-red-50 rounded flex-shrink-0">
                              <Trash2 size={14} className="text-red-400" />
                            </button>
                          </div>

                          {group.productIds.length === 0 && (
                            <p className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1 mb-2">
                              Nenhum produto elegível ainda — o combo não pode ser ativado até marcar pelo menos 1 aqui.
                            </p>
                          )}

                          {eligibleProducts.length === 0 ? (
                            <p className="text-xs text-gray-400">
                              {group.is_pizza_slot
                                ? 'Nenhum produto de sabor de pizza cadastrado ainda.'
                                : 'Nenhum produto ativo no catálogo ainda.'}
                            </p>
                          ) : (
                            <>
                              {eligibleProducts.length > 6 && (
                                <input
                                  type="text"
                                  placeholder="Buscar produto..."
                                  className="input-field text-sm py-1.5 mb-2"
                                  value={groupProductSearch[group.id] || ''}
                                  onChange={(e) => setGroupProductSearch({ ...groupProductSearch, [group.id]: e.target.value })}
                                />
                              )}
                              <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                                {visibleProducts.map((product) => (
                                  <label key={product.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={group.productIds.includes(product.id)}
                                      onChange={() => handleToggleGroupProduct(group, product.id)}
                                      className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                                    />
                                    <span className="text-sm text-gray-700">{product.name}</span>
                                  </label>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })}

                    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                      <input
                        type="text"
                        placeholder="Nome do grupo (ex: Escolha a sobremesa)"
                        className="input-field text-sm py-1.5"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                      />
                      {pizzaSizes.length > 0 && (
                        <div className="flex items-center gap-3 flex-wrap">
                          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={newGroupIsPizza}
                              onChange={(e) => {
                                setNewGroupIsPizza(e.target.checked)
                                if (!e.target.checked) setNewGroupSizeId('')
                              }}
                              className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                            />
                            É o slot de pizza (cliente só escolhe o sabor)
                          </label>
                          {newGroupIsPizza && (
                            <select
                              className="input-field text-sm py-1.5 w-auto"
                              value={newGroupSizeId}
                              onChange={(e) => setNewGroupSizeId(e.target.value)}
                            >
                              <option value="">Tamanho fixo...</option>
                              {pizzaSizes.map((s) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}
                      <button type="button" onClick={handleAddGroup} className="btn-secondary text-sm py-1.5">
                        <Plus size={14} />
                        Adicionar grupo
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
