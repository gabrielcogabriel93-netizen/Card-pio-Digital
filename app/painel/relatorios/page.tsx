'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { log, logError } from '@/lib/logger'
import type { Order, OrderItem } from '@/types'
import { FeatureGate } from '@/components/FeatureGate'
import { useSubscription } from '@/contexts/SubscriptionContext'
import { TrendingUp, DollarSign, Clock, Award, Loader2, ShoppingBag, ShoppingCart, CalendarDays } from 'lucide-react'

type Period = 'today' | 'week' | 'month' | 'custom'

interface ProductStat {
  name: string
  quantity: number
  revenue: number
}

const WEEKDAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export default function RelatoriosPage() {
  const { hasCompletoAccess } = useSubscription()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [abandonedCartsCount, setAbandonedCartsCount] = useState(0)
  const [period, setPeriod] = useState<Period>('week')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  useEffect(() => {
    loadOrders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, customStart, customEnd])

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
        start.setDate(now.getDate() - 6)
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

  const loadOrders = async () => {
    setLoading(true)
    log('painel:relatorios', 'carregando pedidos do período...', { period })
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

      const { start, end } = getDateRange()

      // Só pedidos que chegaram a ser aceitos (o mesmo critério que já
      // gera lançamento financeiro) — pendente/cancelado não conta como
      // venda de verdade.
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('establishment_id', est.id)
        .in('status', ['confirmed', 'preparing', 'completed'])
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: false })

      if (error) logError('painel:relatorios', 'erro ao carregar pedidos', error)
      if (data) setOrders(data as Order[])

      // Carrinhos abandonados no período (migration 042) -- só a
      // contagem, pra não trazer telefone/nome de cliente pra esta tela.
      const { count } = await supabase
        .from('cart_drafts')
        .select('id', { count: 'exact', head: true })
        .eq('establishment_id', est.id)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
      setAbandonedCartsCount(count ?? 0)
    } catch (error) {
      logError('painel:relatorios', 'exceção ao carregar relatórios', error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total), 0)
  const averageTicket = orders.length > 0 ? totalRevenue / orders.length : 0

  // Produtos mais vendidos: soma quantidade/receita a partir dos itens
  // (JSONB) de cada pedido do período — dado real, sem estimativa.
  const productStats = (() => {
    const map = new Map<string, ProductStat>()
    orders.forEach((order) => {
      (order.items as OrderItem[]).forEach((item) => {
        const current = map.get(item.product_name) || { name: item.product_name, quantity: 0, revenue: 0 }
        current.quantity += item.quantity
        current.revenue += item.total_price
        map.set(item.product_name, current)
      })
    })
    return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 10)
  })()

  // Horário de pico: pedidos por hora do dia (hora local do navegador).
  const hourCounts = (() => {
    const counts = new Array(24).fill(0)
    orders.forEach((o) => {
      counts[new Date(o.created_at).getHours()]++
    })
    return counts
  })()
  const maxHourCount = Math.max(1, ...hourCounts)
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts))

  // Mais vendidos por dia da semana: mesma agregação de productStats,
  // só bucketizada por .getDay() (0=domingo) em vez de um total único.
  const weekdayStats = (() => {
    const buckets: Map<string, ProductStat>[] = Array.from({ length: 7 }, () => new Map())
    const orderCounts = new Array(7).fill(0)
    orders.forEach((order) => {
      const day = new Date(order.created_at).getDay()
      orderCounts[day]++
      ;(order.items as OrderItem[]).forEach((item) => {
        const map = buckets[day]
        const current = map.get(item.product_name) || { name: item.product_name, quantity: 0, revenue: 0 }
        current.quantity += item.quantity
        current.revenue += item.total_price
        map.set(item.product_name, current)
      })
    })
    return WEEKDAY_NAMES.map((name, day) => ({
      name,
      orderCount: orderCounts[day],
      topProducts: Array.from(buckets[day].values()).sort((a, b) => b.quantity - a.quantity).slice(0, 3),
    }))
  })()

  // Mais vendido por horário: mesma ideia, bucketizada por .getHours() --
  // só o produto nº1 de cada hora, pra caber numa lista compacta.
  const hourlyTopProduct = (() => {
    const buckets: Map<string, ProductStat>[] = Array.from({ length: 24 }, () => new Map())
    orders.forEach((order) => {
      const hour = new Date(order.created_at).getHours()
      ;(order.items as OrderItem[]).forEach((item) => {
        const map = buckets[hour]
        const current = map.get(item.product_name) || { name: item.product_name, quantity: 0, revenue: 0 }
        current.quantity += item.quantity
        current.revenue += item.total_price
        map.set(item.product_name, current)
      })
    })
    return buckets
      .map((map, hour) => ({ hour, top: Array.from(map.values()).sort((a, b) => b.quantity - a.quantity)[0] }))
      .filter((h) => h.top)
  })()

  if (loading && orders.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-primary-500" />
      </div>
    )
  }

  if (!hasCompletoAccess) {
    return <FeatureGate featureName="Relatórios financeiros" description="Faturamento, ticket médio, produtos mais vendidos e horário de pico." />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Relatórios</h1>
        <p className="text-gray-600 mt-1">Mais vendidos, horário de pico e ticket médio do período.</p>
      </div>

      {/* Period selector */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-2">
          {(['today', 'week', 'month', 'custom'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                period === p ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p === 'today' ? 'Hoje' : p === 'week' ? 'Últimos 7 dias' : p === 'month' ? 'Este mês' : 'Personalizado'}
            </button>
          ))}
          {period === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <input type="date" className="input-field text-sm py-1.5" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              <span className="text-gray-400">até</span>
              <input type="date" className="input-field text-sm py-1.5" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
            </div>
          )}
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mb-2">
            <DollarSign size={20} className="text-green-600" />
          </div>
          <p className="stat-value">{formatCurrency(totalRevenue)}</p>
          <p className="text-sm text-gray-600">Faturamento no período</p>
        </div>
        <div className="card">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-2">
            <TrendingUp size={20} className="text-blue-600" />
          </div>
          <p className="stat-value">{formatCurrency(averageTicket)}</p>
          <p className="text-sm text-gray-600">Ticket médio</p>
        </div>
        <div className="card">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mb-2">
            <ShoppingBag size={20} className="text-purple-600" />
          </div>
          <p className="stat-value">{orders.length}</p>
          <p className="text-sm text-gray-600">Pedidos no período</p>
        </div>
        <div className="card">
          <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center mb-2">
            <Clock size={20} className="text-amber-600" />
          </div>
          <p className="stat-value">
            {orders.length > 0 ? `${String(peakHour).padStart(2, '0')}h` : '—'}
          </p>
          <p className="text-sm text-gray-600">Horário de pico</p>
        </div>
        <div className="card">
          <div className="w-10 h-10 bg-rose-100 rounded-lg flex items-center justify-center mb-2">
            <ShoppingCart size={20} className="text-rose-600" />
          </div>
          <p className="stat-value">{abandonedCartsCount}</p>
          <p className="text-sm text-gray-600">Carrinhos abandonados</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top products */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Award size={18} className="text-primary-500" />
            <h2 className="text-lg font-semibold text-gray-900">Mais vendidos</h2>
          </div>
          {productStats.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Nenhuma venda no período.</p>
          ) : (
            <div className="space-y-3">
              {productStats.map((p, i) => (
                <div key={p.name} className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-400 w-5">{i + 1}º</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1">
                      <div
                        className="h-full bg-primary-500"
                        style={{ width: `${(p.quantity / productStats[0].quantity) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-gray-900">{p.quantity}x</p>
                    <p className="text-xs text-gray-500">{formatCurrency(p.revenue)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Peak hours */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={18} className="text-primary-500" />
            <h2 className="text-lg font-semibold text-gray-900">Pedidos por horário</h2>
          </div>
          {orders.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Nenhuma venda no período.</p>
          ) : (
            <div className="flex items-end gap-1 h-40">
              {hourCounts.map((count, hour) => (
                <div key={hour} className="flex-1 flex flex-col items-center justify-end h-full" title={`${hour}h: ${count} pedido(s)`}>
                  <div
                    className={`w-full rounded-t ${hour === peakHour ? 'bg-primary-500' : 'bg-primary-200'}`}
                    style={{ height: `${(count / maxHourCount) * 100}%`, minHeight: count > 0 ? '2px' : '0' }}
                  />
                  {hour % 4 === 0 && <span className="text-[10px] text-gray-400 mt-1">{hour}h</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Insights de vendas: mais vendidos por dia da semana e por horário */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays size={18} className="text-primary-500" />
            <h2 className="text-lg font-semibold text-gray-900">Mais vendidos por dia da semana</h2>
          </div>
          {orders.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Nenhuma venda no período.</p>
          ) : (
            <div className="space-y-3">
              {weekdayStats.map((w) => (
                <div key={w.name} className="flex items-center justify-between gap-3 border-b border-gray-100 last:border-0 pb-2 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{w.name}</p>
                    <p className="text-xs text-gray-500">{w.orderCount} pedido(s)</p>
                  </div>
                  <div className="text-right min-w-0">
                    {w.topProducts.length === 0 ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : (
                      w.topProducts.map((p) => (
                        <p key={p.name} className="text-xs text-gray-700 truncate">
                          {p.quantity}x {p.name}
                        </p>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Award size={18} className="text-primary-500" />
            <h2 className="text-lg font-semibold text-gray-900">Mais vendido por horário</h2>
          </div>
          {hourlyTopProduct.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Nenhuma venda no período.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {hourlyTopProduct.map(({ hour, top }) => (
                <div key={hour} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-gray-500 w-10 flex-shrink-0">{String(hour).padStart(2, '0')}h</span>
                  <span className="flex-1 text-gray-900 truncate">{top.name}</span>
                  <span className="text-gray-500 flex-shrink-0">{top.quantity}x</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
