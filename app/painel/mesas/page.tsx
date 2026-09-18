'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { log, logError } from '@/lib/logger'
import { useEscapeKey } from '@/lib/useEscapeKey'
import { QrCodeImage } from '@/components/QrCodeImage'
import { sumTabTotal } from '@/lib/tableTab'
import type { RestaurantTable, Order } from '@/types'
import { Plus, Edit2, Trash2, X, Loader2, Table2, ToggleLeft, ToggleRight, QrCode, Printer, Clock, Receipt } from 'lucide-react'

interface OpenTab {
  id: string
  table_id: string
  table_label: string
  opened_at: string
  orders: Pick<Order, 'id' | 'status' | 'total' | 'customer_name'>[]
}

export default function MesasPage() {
  const [establishmentId, setEstablishmentId] = useState('')
  const [establishmentSlug, setEstablishmentSlug] = useState('')
  const [customDomain, setCustomDomain] = useState<string | null>(null)
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([])
  const [loading, setLoading] = useState(true)
  const [closingTabId, setClosingTabId] = useState<string | null>(null)

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<RestaurantTable | null>(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({ label: '' })

  const [qrTable, setQrTable] = useState<RestaurantTable | null>(null)

  useEscapeKey(() => setShowModal(false), showModal)
  useEscapeKey(() => setQrTable(null), !!qrTable)

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadData = async () => {
    log('painel:mesas', 'carregando mesas...')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: est, error: estError } = await supabase
        .from('establishments')
        .select('id, slug, custom_domain')
        .eq('owner_id', user.id)
        .single()

      if (estError) logError('painel:mesas', 'erro ao buscar estabelecimento', estError)
      if (!est) return
      setEstablishmentId(est.id)
      setEstablishmentSlug(est.slug)
      setCustomDomain(est.custom_domain)

      const { data: tablesData, error: tablesError } = await supabase
        .from('restaurant_tables')
        .select('*')
        .eq('establishment_id', est.id)
        .order('display_order')
        .order('created_at')

      if (tablesError) logError('painel:mesas', 'erro ao carregar mesas', tablesError)
      if (tablesData) setTables(tablesData)

      await loadOpenTabs(est.id)
      log('painel:mesas', 'mesas carregadas', { total: tablesData?.length || 0 })
    } catch (error) {
      logError('painel:mesas', 'exceção ao carregar mesas', error)
    } finally {
      setLoading(false)
    }
  }

  const loadOpenTabs = async (estId: string) => {
    const supabase = createClient()
    const { data: tabsData, error: tabsError } = await supabase
      .from('table_tabs')
      .select('id, table_id, opened_at, restaurant_tables(label)')
      .eq('establishment_id', estId)
      .eq('status', 'open')
      .order('opened_at')

    if (tabsError) {
      logError('painel:mesas', 'erro ao carregar comandas abertas', tabsError)
      return
    }
    if (!tabsData || tabsData.length === 0) {
      setOpenTabs([])
      return
    }

    const tabIds = tabsData.map((t) => t.id)
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select('id, table_tab_id, status, total, customer_name')
      .in('table_tab_id', tabIds)
      .neq('status', 'cancelled')

    if (ordersError) logError('painel:mesas', 'erro ao carregar pedidos das comandas', ordersError)

    const tabs: OpenTab[] = tabsData.map((t: any) => ({
      id: t.id,
      table_id: t.table_id,
      table_label: t.restaurant_tables?.label || '?',
      opened_at: t.opened_at,
      orders: (ordersData || []).filter((o: any) => o.table_tab_id === t.id),
    }))
    setOpenTabs(tabs)
  }

  const openNew = () => {
    setEditing(null)
    setFormData({ label: '' })
    setShowModal(true)
  }

  const openEdit = (t: RestaurantTable) => {
    setEditing(t)
    setFormData({ label: t.label })
    setShowModal(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    log('painel:mesas', editing ? 'salvando edição de mesa' : 'criando mesa', { label: formData.label })

    try {
      const supabase = createClient()
      const payload = { establishment_id: establishmentId, label: formData.label.trim() }

      if (editing) {
        const { error } = await supabase.from('restaurant_tables').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('restaurant_tables').insert({ ...payload, is_active: true })
        if (error) throw error
      }

      log('painel:mesas', 'mesa salva com sucesso')
      await loadData()
      setShowModal(false)
    } catch (error: any) {
      logError('painel:mesas', 'erro ao salvar mesa', error)
      const message = error.code === '23505' ? 'Já existe uma mesa com esse nome.' : error.message
      alert('Erro ao salvar: ' + message)
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (t: RestaurantTable) => {
    try {
      const supabase = createClient()
      const { error } = await supabase.from('restaurant_tables').update({ is_active: !t.is_active }).eq('id', t.id)
      if (error) throw error
      await loadData()
    } catch (error: any) {
      logError('painel:mesas', 'erro ao alterar status da mesa', error)
      alert('Erro ao alterar status: ' + error.message)
    }
  }

  const handleCloseTab = async (tab: OpenTab) => {
    if (!confirm(`Fechar a conta da ${tab.table_label}? Isso vai gerar as entradas financeiras dos pedidos concluídos.`)) return
    setClosingTabId(tab.id)
    try {
      const supabase = createClient()
      const { error } = await supabase.rpc('close_table_tab', { p_tab_id: tab.id })
      if (error) throw error
      log('painel:mesas', 'comanda fechada', { tabId: tab.id })
      await loadOpenTabs(establishmentId)
    } catch (error: any) {
      logError('painel:mesas', 'erro ao fechar comanda', error)
      alert('Não foi possível fechar a conta: ' + error.message)
    } finally {
      setClosingTabId(null)
    }
  }

  const getQrUrl = (table: RestaurantTable) => {
    const base = customDomain ? `https://${customDomain}` : (typeof window !== 'undefined' ? window.location.origin : '')
    return `${base}/loja/${establishmentSlug}?mesa=${table.id}`
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

  const minutesOpen = (openedAt: string) => Math.max(0, Math.round((Date.now() - new Date(openedAt).getTime()) / 60000))

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
          <h1 className="page-title">Mesas</h1>
          <p className="text-gray-600 mt-1">
            Cada mesa tem um QR Code — o cliente escaneia, pede pelo celular e tudo fica na comanda até você fechar a conta.
          </p>
        </div>
        <button onClick={openNew} className="btn-primary">
          <Plus size={18} />
          Nova Mesa
        </button>
      </div>

      {/* Comandas abertas agora */}
      {openTabs.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Comandas abertas agora</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {openTabs.map((tab) => {
              const total = sumTabTotal(tab.orders)
              const pendingCount = tab.orders.filter((o) => o.status !== 'completed').length
              return (
                <div key={tab.id} className="card">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Receipt size={18} className="text-primary-500" />
                      <span className="font-semibold text-gray-900">{tab.table_label}</span>
                    </div>
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock size={12} /> {minutesOpen(tab.opened_at)} min
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mb-2">{tab.orders.length} pedido(s)</p>
                  <p className="text-2xl font-bold text-primary-600 mb-2">{formatCurrency(total)}</p>
                  {pendingCount > 0 && (
                    <p className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1 mb-3">
                      {pendingCount} pedido(s) ainda não concluído(s) em Pedidos — conclua antes de fechar a conta.
                    </p>
                  )}
                  <button
                    onClick={() => handleCloseTab(tab)}
                    disabled={pendingCount > 0 || closingTabId === tab.id}
                    className="btn-primary w-full text-sm py-2"
                  >
                    {closingTabId === tab.id ? <Loader2 size={16} className="animate-spin" /> : 'Fechar conta'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Lista de mesas */}
      {tables.length === 0 ? (
        <div className="card text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Table2 size={32} className="text-gray-400" />
          </div>
          <p className="text-gray-600 mb-2">Nenhuma mesa cadastrada.</p>
          <p className="text-sm text-gray-500 mb-4">Crie suas mesas e gere um QR Code pra cada uma.</p>
          <button onClick={openNew} className="btn-primary">
            <Plus size={18} />
            Criar primeira mesa
          </button>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="divide-y divide-gray-100">
            {tables.map((t) => (
              <div key={t.id} className={`flex items-center justify-between p-4 ${!t.is_active ? 'opacity-60' : ''}`}>
                <div className="flex items-center gap-3">
                  <Table2 size={18} className="text-primary-500 flex-shrink-0" />
                  <p className="font-medium text-gray-900">{t.label}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setQrTable(t)}
                    className="p-1.5 hover:bg-gray-100 rounded"
                    aria-label="Ver QR Code"
                    title="Ver QR Code"
                  >
                    <QrCode size={16} className="text-gray-500" />
                  </button>
                  <button
                    onClick={() => toggleActive(t)}
                    className="p-1.5 hover:bg-gray-100 rounded"
                    aria-label={t.is_active ? 'Desativar mesa' : 'Ativar mesa'}
                    title={t.is_active ? 'Desativar' : 'Ativar'}
                  >
                    {t.is_active ? (
                      <ToggleRight size={18} className="text-primary-500" />
                    ) : (
                      <ToggleLeft size={18} className="text-gray-400" />
                    )}
                  </button>
                  <button onClick={() => openEdit(t)} className="p-1.5 hover:bg-gray-100 rounded" aria-label="Renomear mesa">
                    <Edit2 size={16} className="text-gray-400" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: criar/renomear mesa */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md animate-fade-in">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">{editing ? 'Renomear Mesa' : 'Nova Mesa'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded" aria-label="Fechar">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome da mesa *</label>
                <input
                  type="text"
                  className="input-field"
                  value={formData.label}
                  onChange={(e) => setFormData({ label: e.target.value })}
                  placeholder="Ex: Mesa 1, Varanda 2..."
                  required
                  autoFocus
                />
              </div>
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

      {/* Modal: QR Code */}
      {qrTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:relative print:inset-auto print:p-0">
          <div className="fixed inset-0 bg-black/50 print:hidden" onClick={() => setQrTable(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6 text-center animate-fade-in print:shadow-none">
            <button
              onClick={() => setQrTable(null)}
              className="absolute top-4 right-4 p-1 hover:bg-gray-100 rounded print:hidden"
              aria-label="Fechar"
            >
              <X size={20} />
            </button>
            <p className="text-lg font-semibold text-gray-900 mb-4">{qrTable.label}</p>
            <div className="flex justify-center mb-4">
              <QrCodeImage value={getQrUrl(qrTable)} size={240} />
            </div>
            <p className="text-xs text-gray-400 break-all mb-4 print:hidden">{getQrUrl(qrTable)}</p>
            <button onClick={() => window.print()} className="btn-primary w-full print:hidden">
              <Printer size={16} />
              Imprimir
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
