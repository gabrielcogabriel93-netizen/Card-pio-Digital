'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { log, logError } from '@/lib/logger'
import { useEscapeKey } from '@/lib/useEscapeKey'
import type { LoyaltySettings, LoyaltyReward, LoyaltyBenefitType } from '@/types'
import { Plus, Edit2, Trash2, X, Loader2, Gift, ToggleLeft, ToggleRight } from 'lucide-react'

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

export default function FidelidadePage() {
  const [establishmentId, setEstablishmentId] = useState('')
  const [loading, setLoading] = useState(true)

  const [settings, setSettings] = useState<LoyaltySettings | null>(null)
  const [settingsForm, setSettingsForm] = useState({
    is_active: false,
    points_per_currency: '1',
    min_order_value_for_points: '',
  })
  const [savingSettings, setSavingSettings] = useState(false)

  const [rewards, setRewards] = useState<LoyaltyReward[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingReward, setEditingReward] = useState<LoyaltyReward | null>(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    points_cost: '',
    benefit_type: 'percent_discount' as LoyaltyBenefitType,
    benefit_value: '',
    is_active: true,
  })

  useEscapeKey(() => setShowModal(false), showModal)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    log('painel:fidelidade', 'carregando dados de fidelidade...')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: est, error: estError } = await supabase
        .from('establishments')
        .select('id')
        .eq('owner_id', user.id)
        .single()

      if (estError) logError('painel:fidelidade', 'erro ao buscar estabelecimento', estError)
      if (!est) return
      setEstablishmentId(est.id)

      const [{ data: settingsRow, error: settingsError }, { data: rewardsData, error: rewardsError }] = await Promise.all([
        supabase.from('loyalty_settings').select('*').eq('establishment_id', est.id).maybeSingle(),
        supabase.from('loyalty_rewards').select('*').eq('establishment_id', est.id).order('points_cost', { ascending: true }),
      ])

      if (settingsError) logError('painel:fidelidade', 'erro ao carregar configurações', settingsError)
      if (settingsRow) {
        setSettings(settingsRow)
        setSettingsForm({
          is_active: settingsRow.is_active,
          points_per_currency: String(settingsRow.points_per_currency ?? 1),
          min_order_value_for_points: settingsRow.min_order_value_for_points != null ? String(settingsRow.min_order_value_for_points) : '',
        })
      }

      if (rewardsError) logError('painel:fidelidade', 'erro ao carregar recompensas', rewardsError)
      if (rewardsData) setRewards(rewardsData)

      log('painel:fidelidade', 'dados carregados', { hasSettings: !!settingsRow, totalRewards: rewardsData?.length || 0 })
    } catch (error) {
      logError('painel:fidelidade', 'exceção ao carregar dados', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingSettings(true)
    log('painel:fidelidade', 'salvando configurações do programa...', { isActive: settingsForm.is_active })

    try {
      const supabase = createClient()
      const payload = {
        establishment_id: establishmentId,
        is_active: settingsForm.is_active,
        points_per_currency: parseFloat(settingsForm.points_per_currency) || 0,
        min_order_value_for_points: settingsForm.min_order_value_for_points ? parseFloat(settingsForm.min_order_value_for_points) : null,
      }
      const { data, error } = await supabase
        .from('loyalty_settings')
        .upsert(payload, { onConflict: 'establishment_id' })
        .select()
        .single()

      if (error) throw error
      setSettings(data)
      log('painel:fidelidade', 'configurações salvas com sucesso')
      alert('Configurações do programa salvas com sucesso!')
    } catch (error: any) {
      logError('painel:fidelidade', 'erro ao salvar configurações', error)
      alert('Erro ao salvar: ' + error.message)
    } finally {
      setSavingSettings(false)
    }
  }

  const openNewReward = () => {
    setEditingReward(null)
    setFormData({
      name: '',
      description: '',
      points_cost: '',
      benefit_type: 'percent_discount',
      benefit_value: '',
      is_active: true,
    })
    setShowModal(true)
  }

  const openEditReward = (reward: LoyaltyReward) => {
    setEditingReward(reward)
    setFormData({
      name: reward.name,
      description: reward.description || '',
      points_cost: String(reward.points_cost),
      benefit_type: reward.benefit_type,
      benefit_value: reward.benefit_value != null ? String(reward.benefit_value) : '',
      is_active: reward.is_active,
    })
    setShowModal(true)
  }

  const handleSaveReward = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    log('painel:fidelidade', editingReward ? 'salvando edição de recompensa' : 'criando recompensa', { name: formData.name })

    try {
      const supabase = createClient()
      const rewardData = {
        establishment_id: establishmentId,
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        points_cost: parseInt(formData.points_cost) || 0,
        benefit_type: formData.benefit_type,
        benefit_value: formData.benefit_type === 'free_shipping' ? null : (parseFloat(formData.benefit_value) || 0),
        is_active: formData.is_active,
      }

      if (editingReward) {
        const { error } = await supabase.from('loyalty_rewards').update(rewardData).eq('id', editingReward.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('loyalty_rewards').insert(rewardData)
        if (error) throw error
      }

      log('painel:fidelidade', 'recompensa salva com sucesso')
      await loadData()
      setShowModal(false)
    } catch (error: any) {
      logError('painel:fidelidade', 'erro ao salvar recompensa', error)
      alert('Erro ao salvar: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteReward = async (reward: LoyaltyReward) => {
    if (!confirm(`Excluir a recompensa "${reward.name}"?`)) return
    try {
      const supabase = createClient()
      const { error } = await supabase.from('loyalty_rewards').delete().eq('id', reward.id)
      if (error) throw error
      await loadData()
    } catch (error: any) {
      logError('painel:fidelidade', 'erro ao excluir recompensa', error)
      alert('Erro ao excluir: ' + error.message)
    }
  }

  const toggleRewardActive = async (reward: LoyaltyReward) => {
    try {
      const supabase = createClient()
      const { error } = await supabase.from('loyalty_rewards').update({ is_active: !reward.is_active }).eq('id', reward.id)
      if (error) throw error
      await loadData()
    } catch (error: any) {
      logError('painel:fidelidade', 'erro ao alterar status da recompensa', error)
      alert('Erro ao alterar status: ' + error.message)
    }
  }

  const formatBenefit = (reward: LoyaltyReward) => {
    if (reward.benefit_type === 'free_shipping') return 'Frete grátis'
    if (reward.benefit_type === 'percent_discount') return `${reward.benefit_value}% de desconto`
    return `${formatCurrency(Number(reward.benefit_value || 0))} de desconto`
  }

  const pointsPerCurrencyPreview = parseFloat(settingsForm.points_per_currency) || 0

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
        <h1 className="page-title">Fidelidade</h1>
        <p className="text-gray-600 mt-1">Cliente ganha pontos a cada compra e troca por descontos no seu cardápio.</p>
      </div>

      {/* Ativar/desativar + regra de acúmulo */}
      <form onSubmit={handleSaveSettings} className="card space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Programa de pontos</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {settingsForm.is_active ? 'Ativo — clientes ganham e resgatam pontos no cardápio.' : 'Desativado — nada de pontos aparece pro cliente.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSettingsForm({ ...settingsForm, is_active: !settingsForm.is_active })}
            aria-label={settingsForm.is_active ? 'Desativar programa' : 'Ativar programa'}
          >
            {settingsForm.is_active ? (
              <ToggleRight size={36} className="text-primary-500" />
            ) : (
              <ToggleLeft size={36} className="text-gray-400" />
            )}
          </button>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pontos por R$1,00 gasto</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="input-field max-w-[160px]"
              value={settingsForm.points_per_currency}
              onChange={(e) => setSettingsForm({ ...settingsForm, points_per_currency: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pedido mínimo para pontuar</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="input-field max-w-[160px]"
              value={settingsForm.min_order_value_for_points}
              onChange={(e) => setSettingsForm({ ...settingsForm, min_order_value_for_points: e.target.value })}
              placeholder="Sem mínimo"
            />
          </div>
        </div>

        <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          Pré-visualização: um pedido de {formatCurrency(100)} rende{' '}
          <strong>{Math.floor(100 * pointsPerCurrencyPreview)} pontos</strong>.
        </p>

        <div className="flex justify-end pt-2 border-t border-gray-100">
          <button type="submit" className="btn-primary" disabled={savingSettings}>
            {savingSettings ? <Loader2 size={18} className="animate-spin" /> : 'Salvar regra'}
          </button>
        </div>
      </form>

      {/* Recompensas */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Recompensas</h2>
          <p className="text-sm text-gray-500 mt-0.5">O que o cliente pode resgatar com os pontos acumulados.</p>
        </div>
        <button onClick={openNewReward} className="btn-primary">
          <Plus size={18} />
          Nova Recompensa
        </button>
      </div>

      {rewards.length === 0 ? (
        <div className="card text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Gift size={32} className="text-gray-400" />
          </div>
          <p className="text-gray-600 mb-2">Nenhuma recompensa criada.</p>
          <p className="text-sm text-gray-500 mb-4">Crie recompensas como &quot;10% de desconto&quot; ou &quot;Frete grátis&quot; para o cliente trocar pontos.</p>
          <button onClick={openNewReward} className="btn-primary">
            <Plus size={18} />
            Criar primeira recompensa
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rewards.map((reward) => (
            <div key={reward.id} className={`card-hover ${!reward.is_active ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Gift size={18} className="text-primary-500" />
                  <span className="font-semibold text-gray-900">{reward.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleRewardActive(reward)}
                    className="p-1.5 hover:bg-gray-100 rounded"
                    aria-label={reward.is_active ? 'Desativar recompensa' : 'Ativar recompensa'}
                    title={reward.is_active ? 'Desativar' : 'Ativar'}
                  >
                    {reward.is_active ? (
                      <ToggleRight size={18} className="text-primary-500" />
                    ) : (
                      <ToggleLeft size={18} className="text-gray-400" />
                    )}
                  </button>
                  <button onClick={() => openEditReward(reward)} className="p-1.5 hover:bg-gray-100 rounded" aria-label="Editar recompensa">
                    <Edit2 size={16} className="text-gray-400" />
                  </button>
                  <button onClick={() => handleDeleteReward(reward)} className="p-1.5 hover:bg-red-50 rounded" aria-label="Excluir recompensa">
                    <Trash2 size={16} className="text-red-400" />
                  </button>
                </div>
              </div>

              <p className="text-2xl font-bold text-primary-600 mb-1">{reward.points_cost} pontos</p>
              <p className="text-sm text-gray-600">{formatBenefit(reward)}</p>
              {reward.description && <p className="text-xs text-gray-500 mt-2">{reward.description}</p>}
              {!reward.is_active && <p className="text-xs text-gray-500 font-medium mt-2">Desativada</p>}
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
                {editingReward ? 'Editar Recompensa' : 'Nova Recompensa'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded" aria-label="Fechar">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveReward} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input
                  type="text"
                  className="input-field"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: 10% de desconto"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição (opcional)</label>
                <input
                  type="text"
                  className="input-field"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Mostrado pro cliente junto do nome"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Custo em pontos *</label>
                <input
                  type="number"
                  min="1"
                  className="input-field max-w-[160px]"
                  value={formData.points_cost}
                  onChange={(e) => setFormData({ ...formData, points_cost: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de benefício</label>
                  <select
                    className="input-field"
                    value={formData.benefit_type}
                    onChange={(e) => setFormData({ ...formData, benefit_type: e.target.value as LoyaltyBenefitType })}
                  >
                    <option value="percent_discount">Desconto percentual (%)</option>
                    <option value="fixed_discount">Desconto fixo (R$)</option>
                    <option value="free_shipping">Frete grátis</option>
                  </select>
                </div>
                {formData.benefit_type === 'free_shipping' ? (
                  <div className="flex items-end">
                    <p className="text-xs text-gray-500 pb-2.5">Zera a taxa de entrega — não desconta o valor dos produtos.</p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {formData.benefit_type === 'percent_discount' ? 'Desconto (%)' : 'Desconto (R$)'} *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={formData.benefit_type === 'percent_discount' ? '100' : undefined}
                      className="input-field"
                      value={formData.benefit_value}
                      onChange={(e) => setFormData({ ...formData, benefit_value: e.target.value })}
                      required
                    />
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Recompensa ativa</span>
              </label>

              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">
                  Cancelar
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={saving}>
                  {saving ? <Loader2 size={18} className="animate-spin" /> : editingReward ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
