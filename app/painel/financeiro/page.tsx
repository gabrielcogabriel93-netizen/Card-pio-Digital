'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { log, logError } from '@/lib/logger'
import type { FinancialEntry } from '@/types'
import { DollarSign, TrendingUp, TrendingDown, Calendar, Loader2, ArrowLeft, ArrowRight, Plus, X } from 'lucide-react'

type Period = 'today' | 'week' | 'month' | 'custom'

export default function FinanceiroPage() {
  const [entries, setEntries] = useState<FinancialEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('today')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [establishmentId, setEstablishmentId] = useState<string>('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [entryType, setEntryType] = useState<'income' | 'expense'>('expense')
  const [entryAmount, setEntryAmount] = useState('')
  const [entryDescription, setEntryDescription] = useState('')

  useEffect(() => {
    loadEntries()
  }, [period, customStart, customEnd])

  const openNewEntry = () => {
    setEntryType('expense')
    setEntryAmount('')
    setEntryDescription('')
    setShowModal(true)
  }

  const handleDeleteEntry = async (entry: FinancialEntry) => {
    if (!confirm('Excluir este lançamento?')) return
    log('painel:financeiro', 'excluindo lançamento', { id: entry.id })
    try {
      const supabase = createClient()
      const { error } = await supabase.from('financial_entries').delete().eq('id', entry.id)
      if (error) throw error
      log('painel:financeiro', 'lançamento excluído com sucesso')
      await loadEntries()
    } catch (error: any) {
      logError('painel:financeiro', 'erro ao excluir lançamento', error)
      alert('Erro ao excluir: ' + error.message)
    }
  }

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault()
    const amount = parseFloat(entryAmount)
    if (!amount || amount <= 0 || !establishmentId) return
    setSaving(true)
    log('painel:financeiro', 'salvando novo lançamento', { entryType, amount })

    try {
      const supabase = createClient()
      const { error } = await supabase.from('financial_entries').insert({
        establishment_id: establishmentId,
        type: entryType,
        amount,
        description: entryDescription.trim() || null,
      })
      if (error) throw error

      log('painel:financeiro', 'lançamento salvo com sucesso')
      setShowModal(false)
      await loadEntries()
    } catch (error: any) {
      logError('painel:financeiro', 'erro ao salvar lançamento', error)
      alert('Erro ao salvar lançamento: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const getDateRange = (): { start: Date; end: Date } => {
    const now = new Date()
    const end = new Date(now)
    end.setHours(23, 59, 59, 999)

    let start: Date

    switch (period) {
      case 'today':
        start = new Date(now)
        start.setHours(0, 0, 0, 0)
        break
      case 'week':
        start = new Date(now)
        start.setDate(now.getDate() - now.getDay())
        start.setHours(0, 0, 0, 0)
        break
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1)
        start.setHours(0, 0, 0, 0)
        break
      case 'custom':
        start = customStart ? new Date(customStart) : new Date(now)
        start.setHours(0, 0, 0, 0)
        if (customEnd) {
          const customEndDate = new Date(customEnd)
          customEndDate.setHours(23, 59, 59, 999)
          return { start, end: customEndDate }
        }
        return { start, end }
      default:
        start = new Date(now)
        start.setHours(0, 0, 0, 0)
    }

    return { start, end }
  }

  const loadEntries = async () => {
    log('painel:financeiro', 'carregando lançamentos...', { period })
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: est, error: estError } = await supabase
        .from('establishments')
        .select('id')
        .eq('owner_id', user.id)
        .single()

      if (estError) logError('painel:financeiro', 'erro ao buscar estabelecimento', estError)
      if (!est) return
      setEstablishmentId(est.id)

      const { start, end } = getDateRange()

      const { data, error } = await supabase
        .from('financial_entries')
        .select('*')
        .eq('establishment_id', est.id)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: false })

      if (error) logError('painel:financeiro', 'erro ao carregar lançamentos', error)
      if (data) setEntries(data as FinancialEntry[])
      log('painel:financeiro', 'lançamentos carregados', { total: data?.length || 0 })
    } catch (error) {
      logError('painel:financeiro', 'exceção ao carregar financeiro', error)
    } finally {
      setLoading(false)
    }
  }

  const totalIncome = entries
    .filter(e => e.type === 'income')
    .reduce((sum, e) => sum + Number(e.amount), 0)

  const totalExpense = entries
    .filter(e => e.type === 'expense')
    .reduce((sum, e) => sum + Number(e.amount), 0)

  const balance = totalIncome - totalExpense

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financeiro</h1>
          <p className="text-gray-600 mt-1">Acompanhe suas movimentações financeiras.</p>
        </div>
        <button onClick={openNewEntry} className="btn-primary">
          <Plus size={18} />
          Novo Lançamento
        </button>
      </div>

      {/* Period Filter */}
      <div className="flex flex-wrap gap-3">
        {[
          { value: 'today' as Period, label: 'Hoje' },
          { value: 'week' as Period, label: 'Esta Semana' },
          { value: 'month' as Period, label: 'Este Mês' },
          { value: 'custom' as Period, label: 'Personalizado' },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => setPeriod(opt.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              period === opt.value
                ? 'bg-primary-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Custom Date Range */}
      {period === 'custom' && (
        <div className="flex gap-4 items-center">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Data inicial</label>
            <input
              type="date"
              className="input-field"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
            />
          </div>
          <span className="text-gray-400 mt-6">até</span>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Data final</label>
            <input
              type="date"
              className="input-field"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <TrendingUp size={20} className="text-green-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(totalIncome)}</p>
          <p className="text-sm text-gray-600">Entradas</p>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <TrendingDown size={20} className="text-red-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-red-600">{formatCurrency(totalExpense)}</p>
          <p className="text-sm text-gray-600">Saídas</p>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <DollarSign size={20} className="text-blue-600" />
            </div>
          </div>
          <p className={`text-2xl font-bold ${balance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
            {formatCurrency(balance)}
          </p>
          <p className="text-sm text-gray-600">Saldo do período</p>
        </div>
      </div>

      {/* Entries List */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Movimentações</h2>

        {entries.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <DollarSign size={40} className="mx-auto mb-3 text-gray-300" />
            <p>Nenhuma movimentação neste período.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    entry.type === 'income' ? 'bg-green-100' : 'bg-red-100'
                  }`}>
                    {entry.type === 'income' ? (
                      <TrendingUp size={18} className="text-green-600" />
                    ) : (
                      <TrendingDown size={18} className="text-red-600" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {entry.description || (entry.type === 'income' ? 'Entrada' : 'Saída')}
                    </p>
                    <p className="text-xs text-gray-500">{formatDate(entry.created_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`font-medium ${
                    entry.type === 'income' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {entry.type === 'income' ? '+' : '-'}{formatCurrency(Number(entry.amount))}
                  </span>
                  {!entry.order_id && (
                    <button
                      onClick={() => handleDeleteEntry(entry)}
                      className="text-gray-300 hover:text-red-500 transition-colors"
                      title="Excluir lançamento"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Entry Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md animate-fade-in">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Novo Lançamento</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveEntry} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEntryType('expense')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
                      entryType === 'expense'
                        ? 'border-red-500 bg-red-50 text-red-700'
                        : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    Saída
                  </button>
                  <button
                    type="button"
                    onClick={() => setEntryType('income')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
                      entryType === 'income'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    Entrada
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="input-field"
                  value={entryAmount}
                  onChange={(e) => setEntryAmount(e.target.value)}
                  placeholder="0,00"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <input
                  type="text"
                  className="input-field"
                  value={entryDescription}
                  onChange={(e) => setEntryDescription(e.target.value)}
                  placeholder="Ex: Compra de insumos, aluguel..."
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary flex-1"
                  disabled={saving || !entryAmount || parseFloat(entryAmount) <= 0}
                >
                  {saving ? <Loader2 size={18} className="animate-spin" /> : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
