'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { log, logError } from '@/lib/logger'
import { useEscapeKey } from '@/lib/useEscapeKey'
import type { DeliveryNeighborhood } from '@/types'
import { Plus, Edit2, Trash2, X, Loader2, MapPin, ToggleLeft, ToggleRight } from 'lucide-react'

export default function BairrosPage() {
  const [neighborhoods, setNeighborhoods] = useState<DeliveryNeighborhood[]>([])
  const [establishmentId, setEstablishmentId] = useState('')
  const [useNeighborhoodFee, setUseNeighborhoodFee] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<DeliveryNeighborhood | null>(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({ name: '', fee: '', is_active: true })

  useEscapeKey(() => setShowModal(false), showModal)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    log('painel:bairros', 'carregando bairros...')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: est, error: estError } = await supabase
        .from('establishments')
        .select('id, use_neighborhood_delivery_fee')
        .eq('owner_id', user.id)
        .single()

      if (estError) logError('painel:bairros', 'erro ao buscar estabelecimento', estError)
      if (!est) return
      setEstablishmentId(est.id)
      setUseNeighborhoodFee(est.use_neighborhood_delivery_fee ?? false)

      const { data, error } = await supabase
        .from('delivery_neighborhoods')
        .select('*')
        .eq('establishment_id', est.id)
        .order('name')

      if (error) logError('painel:bairros', 'erro ao carregar bairros', error)
      if (data) setNeighborhoods(data)
      log('painel:bairros', 'bairros carregados', { total: data?.length || 0 })
    } catch (error) {
      logError('painel:bairros', 'exceção ao carregar bairros', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleFeature = async () => {
    const next = !useNeighborhoodFee
    setUseNeighborhoodFee(next)
    try {
      const supabase = createClient()
      await supabase.from('establishments').update({ use_neighborhood_delivery_fee: next }).eq('id', establishmentId)
    } catch (error) {
      logError('painel:bairros', 'erro ao alternar taxa por bairro', error)
      setUseNeighborhoodFee(!next)
    }
  }

  const openNew = () => {
    setEditing(null)
    setFormData({ name: '', fee: '', is_active: true })
    setShowModal(true)
  }

  const openEdit = (n: DeliveryNeighborhood) => {
    setEditing(n)
    setFormData({ name: n.name, fee: String(n.fee), is_active: n.is_active })
    setShowModal(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    log('painel:bairros', editing ? 'salvando edição de bairro' : 'criando bairro', { name: formData.name })

    try {
      const supabase = createClient()
      const payload = {
        establishment_id: establishmentId,
        name: formData.name.trim(),
        fee: parseFloat(formData.fee) || 0,
        is_active: formData.is_active,
      }

      if (editing) {
        const { error } = await supabase.from('delivery_neighborhoods').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('delivery_neighborhoods').insert(payload)
        if (error) throw error
      }

      log('painel:bairros', 'bairro salvo com sucesso')
      await loadData()
      setShowModal(false)
    } catch (error: any) {
      logError('painel:bairros', 'erro ao salvar bairro', error)
      alert('Erro ao salvar: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (n: DeliveryNeighborhood) => {
    if (!confirm(`Excluir o bairro "${n.name}"?`)) return
    try {
      const supabase = createClient()
      const { error } = await supabase.from('delivery_neighborhoods').delete().eq('id', n.id)
      if (error) throw error
      await loadData()
    } catch (error: any) {
      logError('painel:bairros', 'erro ao excluir bairro', error)
      alert('Erro ao excluir: ' + error.message)
    }
  }

  const toggleActive = async (n: DeliveryNeighborhood) => {
    try {
      const supabase = createClient()
      await supabase.from('delivery_neighborhoods').update({ is_active: !n.is_active }).eq('id', n.id)
      await loadData()
    } catch (error) {
      logError('painel:bairros', 'erro ao alterar status do bairro', error)
    }
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-primary-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Taxa de entrega por bairro</h1>
          <p className="text-gray-600 mt-1">Cadastre os bairros que você atende e o valor do frete de cada um.</p>
        </div>
        <button onClick={openNew} className="btn-primary">
          <Plus size={18} />
          Novo Bairro
        </button>
      </div>

      {/* Toggle da funcionalidade */}
      <div className="card flex items-center justify-between">
        <div>
          <p className="font-medium text-gray-900">Usar taxa de entrega por bairro</p>
          <p className="text-sm text-gray-500">
            Quando ativo, o cliente escolhe o bairro numa lista (em vez de digitar) e o frete
            correspondente é aplicado sozinho. A &quot;Taxa de entrega padrão&quot; das Configurações continua
            valendo como reserva, caso nenhum bairro esteja cadastrado.
          </p>
        </div>
        <button
          type="button"
          onClick={toggleFeature}
          className={`relative w-14 h-7 rounded-full flex-shrink-0 ml-4 transition-colors ${
            useNeighborhoodFee ? 'bg-primary-500' : 'bg-gray-300'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${
              useNeighborhoodFee ? 'translate-x-7' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {useNeighborhoodFee && neighborhoods.filter(n => n.is_active).length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-700">
          A taxa por bairro está ativada, mas nenhum bairro ativo foi cadastrado ainda — por enquanto o
          cardápio vai usar a taxa de entrega padrão das Configurações.
        </div>
      )}

      {neighborhoods.length === 0 ? (
        <div className="card text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <MapPin size={32} className="text-gray-400" />
          </div>
          <p className="text-gray-600 mb-2">Nenhum bairro cadastrado.</p>
          <p className="text-sm text-gray-500 mb-4">Adicione os bairros que você entrega, com o valor do frete de cada um.</p>
          <button onClick={openNew} className="btn-primary">
            <Plus size={18} />
            Cadastrar primeiro bairro
          </button>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="divide-y divide-gray-100">
            {neighborhoods.map((n) => (
              <div key={n.id} className={`flex items-center justify-between p-4 ${!n.is_active ? 'opacity-60' : ''}`}>
                <div className="flex items-center gap-3">
                  <MapPin size={18} className="text-primary-500 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-900">{n.name}</p>
                    <p className="text-sm text-gray-500">{formatCurrency(n.fee)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleActive(n)}
                    className="p-1.5 hover:bg-gray-100 rounded"
                    aria-label={n.is_active ? 'Desativar bairro' : 'Ativar bairro'}
                    title={n.is_active ? 'Desativar' : 'Ativar'}
                  >
                    {n.is_active ? (
                      <ToggleRight size={18} className="text-primary-500" />
                    ) : (
                      <ToggleLeft size={18} className="text-gray-400" />
                    )}
                  </button>
                  <button onClick={() => openEdit(n)} className="p-1.5 hover:bg-gray-100 rounded" aria-label="Editar bairro">
                    <Edit2 size={16} className="text-gray-400" />
                  </button>
                  <button onClick={() => handleDelete(n)} className="p-1.5 hover:bg-red-50 rounded" aria-label="Excluir bairro">
                    <Trash2 size={16} className="text-red-400" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md animate-fade-in">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">{editing ? 'Editar Bairro' : 'Novo Bairro'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded" aria-label="Fechar">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do bairro *</label>
                <input
                  type="text"
                  className="input-field"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Centro"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Taxa de entrega (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input-field"
                  value={formData.fee}
                  onChange={(e) => setFormData({ ...formData, fee: e.target.value })}
                  placeholder="0,00"
                  required
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Bairro ativo (aparece na lista pro cliente)</span>
              </label>

              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">
                  Cancelar
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={saving}>
                  {saving ? <Loader2 size={18} className="animate-spin" /> : editing ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
