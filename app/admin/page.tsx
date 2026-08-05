'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { log, logError } from '@/lib/logger'
import {
  Loader2,
  ShieldCheck,
  Users,
  Clock,
  CheckCircle2,
  Gift,
  Lock,
  ExternalLink,
  Pencil,
  X,
  Megaphone,
} from 'lucide-react'

interface EstablishmentRow {
  id: string
  name: string
  slug: string
  createdAt: string
  subscriptionStatus: 'trial' | 'active' | 'exempt'
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  blocked: boolean
}

interface Overview {
  settings: { billingEnabled: boolean; billingEnabledAt: string | null; monthlyPrice: number }
  establishments: EstablishmentRow[]
  counts: { total: number; trial: number; active: number; exempt: number; blocked: number }
}

const statusLabel: Record<EstablishmentRow['subscriptionStatus'], string> = {
  trial: 'Teste',
  active: 'Assinante',
  exempt: 'Isento',
}

const statusBadgeClass: Record<EstablishmentRow['subscriptionStatus'], string> = {
  trial: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  exempt: 'bg-purple-100 text-purple-700',
}

export default function AdminPage() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [activating, setActivating] = useState(false)
  const [priceDraft, setPriceDraft] = useState('')
  const [savingPrice, setSavingPrice] = useState(false)
  const [trialModalFor, setTrialModalFor] = useState<EstablishmentRow | null>(null)
  const [trialDraft, setTrialDraft] = useState('')
  const [rowActionId, setRowActionId] = useState<string | null>(null)

  const loadOverview = async () => {
    log('admin:page', 'carregando visão geral...')
    try {
      const response = await fetch('/api/admin/overview')
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Erro ao carregar dados')
      setOverview(data)
      setPriceDraft(String(data.settings.monthlyPrice))
    } catch (err) {
      logError('admin:page', 'erro ao carregar visão geral', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadOverview()
  }, [])

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

  const formatDate = (value: string | null) =>
    value ? new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

  const handleActivate = async () => {
    if (!overview) return
    const confirmed = confirm(
      `Isso vai LIGAR a cobrança da plataforma agora. Todos os ${overview.counts.total} estabelecimentos que hoje têm acesso livre (sem prazo) vão ganhar 7 dias de prazo a partir de agora — depois disso, quem não pagar tem o painel bloqueado. Não dá pra desfazer o prazo já concedido. Continuar?`
    )
    if (!confirmed) return

    setActivating(true)
    try {
      const response = await fetch('/api/admin/billing/activate', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Erro ao ativar cobrança')
      await loadOverview()
    } catch (err: any) {
      logError('admin:page', 'erro ao ativar cobrança', err)
      alert(err.message || 'Erro ao ativar cobrança')
    } finally {
      setActivating(false)
    }
  }

  const handleDeactivate = async () => {
    if (!confirm('Desligar a cobrança da plataforma? Ninguém fica bloqueado enquanto estiver desligada.')) return
    setActivating(true)
    try {
      const response = await fetch('/api/admin/billing/deactivate', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Erro ao desativar cobrança')
      await loadOverview()
    } catch (err: any) {
      logError('admin:page', 'erro ao desativar cobrança', err)
      alert(err.message || 'Erro ao desativar cobrança')
    } finally {
      setActivating(false)
    }
  }

  const handleSavePrice = async () => {
    const value = Number(priceDraft.replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0) {
      alert('Informe um valor válido.')
      return
    }
    setSavingPrice(true)
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyPrice: value }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Erro ao salvar')
      await loadOverview()
    } catch (err: any) {
      logError('admin:page', 'erro ao salvar valor da mensalidade', err)
      alert(err.message || 'Erro ao salvar valor')
    } finally {
      setSavingPrice(false)
    }
  }

  const handleOverride = async (establishmentId: string, action: 'exempt' | 'restore') => {
    setRowActionId(establishmentId)
    try {
      const response = await fetch(`/api/admin/establishments/${establishmentId}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Erro ao aplicar alteração')
      await loadOverview()
    } catch (err: any) {
      logError('admin:page', 'erro ao aplicar override', err)
      alert(err.message || 'Erro ao aplicar alteração')
    } finally {
      setRowActionId(null)
    }
  }

  const openTrialModal = (row: EstablishmentRow) => {
    setTrialModalFor(row)
    const base = row.trialEndsAt ? new Date(row.trialEndsAt) : new Date()
    setTrialDraft(base.toISOString().slice(0, 10))
  }

  const handleSaveTrial = async () => {
    if (!trialModalFor || !trialDraft) return
    setRowActionId(trialModalFor.id)
    try {
      const response = await fetch(`/api/admin/establishments/${trialModalFor.id}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_trial_ends_at', trialEndsAt: new Date(trialDraft).toISOString() }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Erro ao ajustar prazo')
      setTrialModalFor(null)
      await loadOverview()
    } catch (err: any) {
      logError('admin:page', 'erro ao ajustar prazo', err)
      alert(err.message || 'Erro ao ajustar prazo')
    } finally {
      setRowActionId(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-primary-500" />
      </div>
    )
  }

  if (!overview) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 text-center">
        <p className="text-gray-600">Não foi possível carregar os dados administrativos.</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck size={24} className="text-primary-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Painel administrativo</h1>
            <p className="text-gray-600 text-sm">Controle de assinantes da plataforma CatalogAI.</p>
          </div>
        </div>
        <Link href="/admin/divulgadores" className="btn-secondary">
          <Megaphone size={16} />
          Divulgadores
        </Link>
      </div>

      {/* Contadores */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="card py-4 text-center">
          <Users size={18} className="text-gray-400 mx-auto mb-1" />
          <p className="text-xl font-bold text-gray-900">{overview.counts.total}</p>
          <p className="text-xs text-gray-500">Total</p>
        </div>
        <div className="card py-4 text-center">
          <Clock size={18} className="text-blue-500 mx-auto mb-1" />
          <p className="text-xl font-bold text-gray-900">{overview.counts.trial}</p>
          <p className="text-xs text-gray-500">Em teste</p>
        </div>
        <div className="card py-4 text-center">
          <CheckCircle2 size={18} className="text-green-500 mx-auto mb-1" />
          <p className="text-xl font-bold text-gray-900">{overview.counts.active}</p>
          <p className="text-xs text-gray-500">Assinantes</p>
        </div>
        <div className="card py-4 text-center">
          <Gift size={18} className="text-purple-500 mx-auto mb-1" />
          <p className="text-xl font-bold text-gray-900">{overview.counts.exempt}</p>
          <p className="text-xs text-gray-500">Isentos</p>
        </div>
        <div className="card py-4 text-center">
          <Lock size={18} className="text-red-500 mx-auto mb-1" />
          <p className="text-xl font-bold text-gray-900">{overview.counts.blocked}</p>
          <p className="text-xs text-gray-500">Bloqueados</p>
        </div>
      </div>

      {/* Cobrança da plataforma */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Cobrança da plataforma</h2>
          <span className={`badge ${overview.settings.billingEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
            {overview.settings.billingEnabled ? 'Ativada' : 'Desativada'}
          </span>
        </div>

        {overview.settings.billingEnabled ? (
          <p className="text-sm text-gray-600 mb-4">
            Ligada desde {formatDate(overview.settings.billingEnabledAt)}. Estabelecimentos em teste ou com
            assinatura vencida têm o painel bloqueado automaticamente.
          </p>
        ) : (
          <p className="text-sm text-gray-600 mb-4">
            Desligada — todo mundo tem acesso livre e ilimitado ao painel, sem prazo nenhum. Ninguém é cobrado
            até você ativar aqui.
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-3 sm:items-end mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Valor da mensalidade</label>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="decimal"
                className="input-field w-32"
                value={priceDraft}
                onChange={(e) => setPriceDraft(e.target.value)}
              />
              <button onClick={handleSavePrice} disabled={savingPrice} className="btn-secondary">
                {savingPrice ? <Loader2 size={16} className="animate-spin" /> : 'Salvar'}
              </button>
            </div>
          </div>
        </div>

        {overview.settings.billingEnabled ? (
          <button onClick={handleDeactivate} disabled={activating} className="btn-secondary">
            {activating ? <Loader2 size={18} className="animate-spin" /> : 'Desativar cobrança'}
          </button>
        ) : (
          <button onClick={handleActivate} disabled={activating} className="btn-primary">
            {activating ? <Loader2 size={18} className="animate-spin" /> : `Ativar cobrança (${formatCurrency(overview.settings.monthlyPrice)}/mês)`}
          </button>
        )}
      </div>

      {/* Lista de estabelecimentos */}
      <div className="card overflow-x-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Estabelecimentos</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-200">
              <th className="pb-2 pr-3">Nome</th>
              <th className="pb-2 pr-3">Cadastro</th>
              <th className="pb-2 pr-3">Status</th>
              <th className="pb-2 pr-3">Prazo</th>
              <th className="pb-2 pr-3">Acesso</th>
              <th className="pb-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {overview.establishments.map((row) => (
              <tr key={row.id} className="border-b border-gray-100 last:border-0">
                <td className="py-2 pr-3">
                  <Link href={`/loja/${row.slug}`} target="_blank" className="flex items-center gap-1 text-gray-900 hover:text-primary-600">
                    {row.name}
                    <ExternalLink size={12} className="text-gray-400" />
                  </Link>
                </td>
                <td className="py-2 pr-3 text-gray-600">{formatDate(row.createdAt)}</td>
                <td className="py-2 pr-3">
                  <span className={`badge ${statusBadgeClass[row.subscriptionStatus]}`}>{statusLabel[row.subscriptionStatus]}</span>
                </td>
                <td className="py-2 pr-3 text-gray-600">
                  {row.subscriptionStatus === 'active' ? formatDate(row.currentPeriodEnd) : formatDate(row.trialEndsAt)}
                </td>
                <td className="py-2 pr-3">
                  {row.blocked ? (
                    <span className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Bloqueado</span>
                  ) : (
                    <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">Liberado</span>
                  )}
                </td>
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openTrialModal(row)}
                      disabled={rowActionId === row.id}
                      className="text-gray-500 hover:text-primary-600"
                      title="Ajustar prazo"
                    >
                      <Pencil size={14} />
                    </button>
                    {row.subscriptionStatus === 'exempt' ? (
                      <button
                        onClick={() => handleOverride(row.id, 'restore')}
                        disabled={rowActionId === row.id}
                        className="text-xs text-gray-600 underline"
                      >
                        Remover isenção
                      </button>
                    ) : (
                      <button
                        onClick={() => handleOverride(row.id, 'exempt')}
                        disabled={rowActionId === row.id}
                        className="text-xs text-gray-600 underline"
                      >
                        Isentar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {overview.establishments.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-gray-400">
                  Nenhum estabelecimento cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de ajuste de prazo */}
      {trialModalFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setTrialModalFor(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Ajustar prazo</h2>
              <button onClick={() => setTrialModalFor(null)} className="p-1 hover:bg-gray-100 rounded" aria-label="Fechar">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">{trialModalFor.name}</p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Novo prazo de teste até</label>
            <input
              type="date"
              className="input-field mb-4"
              value={trialDraft}
              onChange={(e) => setTrialDraft(e.target.value)}
            />
            <button onClick={handleSaveTrial} disabled={rowActionId === trialModalFor.id} className="btn-primary w-full">
              {rowActionId === trialModalFor.id ? <Loader2 size={18} className="animate-spin" /> : 'Salvar prazo'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
