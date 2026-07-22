'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { log, logError } from '@/lib/logger'
import { useEscapeKey } from '@/lib/useEscapeKey'
import type { Coupon } from '@/types'
import { Plus, Edit2, Trash2, X, Loader2, Tag, ToggleLeft, ToggleRight } from 'lucide-react'

export default function CuponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [establishmentId, setEstablishmentId] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    code: '',
    discount_type: 'percent' as 'percent' | 'fixed',
    discount_value: '',
    expires_at: '',
    max_uses: '',
    is_active: true,
  })

  useEscapeKey(() => setShowModal(false), showModal)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    log('painel:cupons', 'carregando cupons...')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: est, error: estError } = await supabase
        .from('establishments')
        .select('id')
        .eq('owner_id', user.id)
        .single()

      if (estError) logError('painel:cupons', 'erro ao buscar estabelecimento', estError)
      if (!est) return
      setEstablishmentId(est.id)

      const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .eq('establishment_id', est.id)
        .order('created_at', { ascending: false })

      if (error) logError('painel:cupons', 'erro ao carregar cupons', error)
      if (data) setCoupons(data)
      log('painel:cupons', 'cupons carregados', { total: data?.length || 0 })
    } catch (error) {
      logError('painel:cupons', 'exceção ao carregar cupons', error)
    } finally {
      setLoading(false)
    }
  }

  const openNewCoupon = () => {
    setEditingCoupon(null)
    setFormData({
      code: '',
      discount_type: 'percent',
      discount_value: '',
      expires_at: '',
      max_uses: '',
      is_active: true,
    })
    setShowModal(true)
  }

  const openEditCoupon = (coupon: Coupon) => {
    setEditingCoupon(coupon)
    setFormData({
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: String(coupon.discount_value),
      expires_at: coupon.expires_at ? coupon.expires_at.slice(0, 10) : '',
      max_uses: coupon.max_uses ? String(coupon.max_uses) : '',
      is_active: coupon.is_active,
    })
    setShowModal(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    log('painel:cupons', editingCoupon ? 'salvando edição de cupom' : 'criando cupom', { code: formData.code })

    try {
      const supabase = createClient()
      const couponData = {
        establishment_id: establishmentId,
        code: formData.code.trim().toUpperCase(),
        discount_type: formData.discount_type,
        discount_value: parseFloat(formData.discount_value) || 0,
        expires_at: formData.expires_at ? new Date(formData.expires_at + 'T23:59:59').toISOString() : null,
        max_uses: formData.max_uses ? parseInt(formData.max_uses) : null,
        is_active: formData.is_active,
      }

      if (editingCoupon) {
        const { error } = await supabase.from('coupons').update(couponData).eq('id', editingCoupon.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('coupons').insert(couponData)
        if (error) throw error
      }

      log('painel:cupons', 'cupom salvo com sucesso')
      await loadData()
      setShowModal(false)
    } catch (error: any) {
      logError('painel:cupons', 'erro ao salvar cupom', error)
      const message = error.code === '23505' ? 'Já existe um cupom com esse código.' : error.message
      alert('Erro ao salvar: ' + message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (coupon: Coupon) => {
    if (!confirm(`Excluir o cupom "${coupon.code}"?`)) return
    try {
      const supabase = createClient()
      const { error } = await supabase.from('coupons').delete().eq('id', coupon.id)
      if (error) throw error
      await loadData()
    } catch (error: any) {
      logError('painel:cupons', 'erro ao excluir cupom', error)
      alert('Erro ao excluir: ' + error.message)
    }
  }

  const toggleActive = async (coupon: Coupon) => {
    try {
      const supabase = createClient()
      await supabase.from('coupons').update({ is_active: !coupon.is_active }).eq('id', coupon.id)
      await loadData()
    } catch (error) {
      logError('painel:cupons', 'erro ao alterar status do cupom', error)
    }
  }

  const formatDiscount = (coupon: Coupon) => {
    return coupon.discount_type === 'percent'
      ? `${coupon.discount_value}%`
      : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(coupon.discount_value)
  }

  const isExpired = (coupon: Coupon) => coupon.expires_at && new Date(coupon.expires_at) < new Date()
  const isExhausted = (coupon: Coupon) => coupon.max_uses !== undefined && coupon.max_uses !== null && coupon.used_count >= coupon.max_uses

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
          <h1 className="text-2xl font-bold text-gray-900">Cupons</h1>
          <p className="text-gray-600 mt-1">Crie cupons de desconto para o seu cardápio online.</p>
        </div>
        <button onClick={openNewCoupon} className="btn-primary">
          <Plus size={18} />
          Novo Cupom
        </button>
      </div>

      {coupons.length === 0 ? (
        <div className="card text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Tag size={32} className="text-gray-400" />
          </div>
          <p className="text-gray-600 mb-2">Nenhum cupom criado.</p>
          <p className="text-sm text-gray-500 mb-4">Crie cupons como "10OFF" ou "PRIMEIRACOMPRA" para promoções.</p>
          <button onClick={openNewCoupon} className="btn-primary">
            <Plus size={18} />
            Criar primeiro cupom
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {coupons.map((coupon) => {
            const expired = isExpired(coupon)
            const exhausted = isExhausted(coupon)
            const inactive = !coupon.is_active || expired || exhausted
            return (
              <div key={coupon.id} className={`card-hover ${inactive ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Tag size={18} className="text-primary-500" />
                    <span className="font-mono font-bold text-gray-900">{coupon.code}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => toggleActive(coupon)}
                      className="p-1.5 hover:bg-gray-100 rounded"
                      aria-label={coupon.is_active ? 'Desativar cupom' : 'Ativar cupom'}
                      title={coupon.is_active ? 'Desativar' : 'Ativar'}
                    >
                      {coupon.is_active ? (
                        <ToggleRight size={18} className="text-primary-500" />
                      ) : (
                        <ToggleLeft size={18} className="text-gray-400" />
                      )}
                    </button>
                    <button
                      onClick={() => openEditCoupon(coupon)}
                      className="p-1.5 hover:bg-gray-100 rounded"
                      aria-label="Editar cupom"
                    >
                      <Edit2 size={16} className="text-gray-400" />
                    </button>
                    <button
                      onClick={() => handleDelete(coupon)}
                      className="p-1.5 hover:bg-red-50 rounded"
                      aria-label="Excluir cupom"
                    >
                      <Trash2 size={16} className="text-red-400" />
                    </button>
                  </div>
                </div>

                <p className="text-2xl font-bold text-primary-600 mb-2">{formatDiscount(coupon)} de desconto</p>

                <div className="text-xs text-gray-500 space-y-0.5">
                  <p>Usos: {coupon.used_count}{coupon.max_uses ? ` / ${coupon.max_uses}` : ''}</p>
                  {coupon.expires_at && (
                    <p>Válido até: {new Date(coupon.expires_at).toLocaleDateString('pt-BR')}</p>
                  )}
                  {expired && <p className="text-red-500 font-medium">Expirado</p>}
                  {exhausted && !expired && <p className="text-red-500 font-medium">Limite de usos atingido</p>}
                  {!coupon.is_active && <p className="text-gray-500 font-medium">Desativado</p>}
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
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md animate-fade-in">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingCoupon ? 'Editar Cupom' : 'Novo Cupom'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded" aria-label="Fechar">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código *</label>
                <input
                  type="text"
                  className="input-field font-mono uppercase"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="Ex: 10OFF"
                  required
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-1">O cliente vai digitar esse código no carrinho.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                  <select
                    className="input-field"
                    value={formData.discount_type}
                    onChange={(e) => setFormData({ ...formData, discount_type: e.target.value as 'percent' | 'fixed' })}
                  >
                    <option value="percent">Percentual (%)</option>
                    <option value="fixed">Valor fixo (R$)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {formData.discount_type === 'percent' ? 'Desconto (%)' : 'Desconto (R$)'} *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={formData.discount_type === 'percent' ? '100' : undefined}
                    className="input-field"
                    value={formData.discount_value}
                    onChange={(e) => setFormData({ ...formData, discount_value: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Validade (opcional)</label>
                  <input
                    type="date"
                    className="input-field"
                    value={formData.expires_at}
                    onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Limite de usos</label>
                  <input
                    type="number"
                    min="1"
                    className="input-field"
                    value={formData.max_uses}
                    onChange={(e) => setFormData({ ...formData, max_uses: e.target.value })}
                    placeholder="Sem limite"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Cupom ativo</span>
              </label>

              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">
                  Cancelar
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={saving}>
                  {saving ? <Loader2 size={18} className="animate-spin" /> : editingCoupon ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
