'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { log, logError } from '@/lib/logger'
import { useEscapeKey } from '@/lib/useEscapeKey'
import type { Category } from '@/types'
import { Plus, Edit2, Trash2, X, Loader2, GripVertical } from 'lucide-react'

export default function CategoriasPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const [saving, setSaving] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  useEffect(() => {
    loadCategories()
  }, [])

  useEscapeKey(() => setShowModal(false), showModal)

  const loadCategories = async () => {
    log('painel:categorias', 'carregando categorias...')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: est, error: estError } = await supabase
        .from('establishments')
        .select('id')
        .eq('owner_id', user.id)
        .single()

      if (estError) logError('painel:categorias', 'erro ao buscar estabelecimento', estError)
      if (!est) return

      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('establishment_id', est.id)
        .order('display_order')

      if (error) logError('painel:categorias', 'erro ao carregar categorias', error)
      if (data) setCategories(data)
      log('painel:categorias', 'categorias carregadas', { total: data?.length || 0 })
    } catch (error) {
      logError('painel:categorias', 'exceção ao carregar categorias', error)
    } finally {
      setLoading(false)
    }
  }

  const openNewCategory = () => {
    setEditingCategory(null)
    setCategoryName('')
    setShowModal(true)
  }

  const openEditCategory = (category: Category) => {
    setEditingCategory(category)
    setCategoryName(category.name)
    setShowModal(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!categoryName.trim()) return
    setSaving(true)

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

      if (editingCategory) {
        const { error } = await supabase
          .from('categories')
          .update({ name: categoryName.trim() })
          .eq('id', editingCategory.id)

        if (error) throw error
      } else {
        const maxOrder = categories.reduce((max, c) => Math.max(max, c.display_order), -1)
        const { error } = await supabase
          .from('categories')
          .insert({
            establishment_id: est.id,
            name: categoryName.trim(),
            display_order: maxOrder + 1,
          })

        if (error) throw error
      }

      log('painel:categorias', 'categoria salva com sucesso')
      await loadCategories()
      setShowModal(false)
    } catch (error: any) {
      logError('painel:categorias', 'erro ao salvar categoria', error)
      alert('Erro ao salvar: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (category: Category) => {
    if (!confirm(`Tem certeza que deseja excluir "${category.name}"? Os produtos desta categoria serão removidos dela.`)) return
    log('painel:categorias', 'excluindo categoria', { id: category.id, name: category.name })

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', category.id)

      if (error) throw error
      log('painel:categorias', 'categoria excluída com sucesso')
      await loadCategories()
    } catch (error: any) {
      logError('painel:categorias', 'erro ao excluir categoria', error)
      alert('Erro ao excluir: ' + error.message)
    }
  }

  const moveCategory = async (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= categories.length) return

    const updated = [...categories]
    const temp = updated[index]
    updated[index] = updated[newIndex]
    updated[newIndex] = temp

    // Atualizar display_order
    const supabase = createClient()
    for (let i = 0; i < updated.length; i++) {
      await supabase
        .from('categories')
        .update({ display_order: i })
        .eq('id', updated[i].id)
    }

    setCategories(updated)
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Categorias</h1>
          <p className="text-gray-600 mt-1">Organize seus produtos em categorias.</p>
        </div>
        <button onClick={openNewCategory} className="btn-primary">
          <Plus size={18} />
          Nova Categoria
        </button>
      </div>

      {categories.length === 0 ? (
        <div className="card text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <p className="text-gray-600 mb-2">Nenhuma categoria criada.</p>
          <p className="text-sm text-gray-500 mb-4">Crie categorias para organizar seus produtos.</p>
          <button onClick={openNewCategory} className="btn-primary">
            <Plus size={18} />
            Criar primeira categoria
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {categories.map((category, index) => (
            <div
              key={category.id}
              className="card-hover flex items-center justify-between animate-fade-in"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => moveCategory(index, 'up')}
                    disabled={index === 0}
                    className="p-0.5 hover:bg-gray-100 rounded disabled:opacity-30"
                    aria-label="Mover categoria para cima"
                  >
                    <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => moveCategory(index, 'down')}
                    disabled={index === categories.length - 1}
                    className="p-0.5 hover:bg-gray-100 rounded disabled:opacity-30"
                    aria-label="Mover categoria para baixo"
                  >
                    <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
                <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center">
                  <span className="text-primary-600 font-medium">
                    {category.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-gray-900">{category.name}</p>
                  <p className="text-xs text-gray-500">Ordem: {category.display_order}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => openEditCategory(category)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                  aria-label="Editar categoria"
                >
                  <Edit2 size={16} className="text-gray-400" />
                </button>
                <button
                  onClick={() => handleDelete(category)}
                  className="p-2 hover:bg-red-50 rounded-lg"
                  aria-label="Excluir categoria"
                >
                  <Trash2 size={16} className="text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md animate-fade-in">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingCategory ? 'Editar Categoria' : 'Nova Categoria'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded" aria-label="Fechar">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome da categoria *</label>
                <input
                  type="text"
                  className="input-field"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="Ex: Pizzas, Bebidas, Sobremesas"
                  required
                  autoFocus
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">
                  Cancelar
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={saving || !categoryName.trim()}>
                  {saving ? <Loader2 size={18} className="animate-spin" /> : editingCategory ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
