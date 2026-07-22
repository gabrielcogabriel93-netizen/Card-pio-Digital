'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { log, logError } from '@/lib/logger'
import Link from 'next/link'
import type { Order, DashboardStats } from '@/types'
import { ShoppingCart, DollarSign, TrendingUp, Package, AlertTriangle, ArrowRight, Clock } from 'lucide-react'

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    pending_orders: 0,
    today_revenue: 0,
    average_ticket: 0,
    low_stock_products: 0,
  })
  const [recentOrders, setRecentOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    log('painel:dashboard', 'carregando dashboard...')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        log('painel:dashboard', 'sem usuário logado')
        return
      }

      // Buscar estabelecimento
      const { data: est, error: estError } = await supabase
        .from('establishments')
        .select('id')
        .eq('owner_id', user.id)
        .single()

      if (estError) logError('painel:dashboard', 'erro ao buscar estabelecimento', estError)
      if (!est) return

      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      // Pedidos pendentes
      const { count: pendingCount } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('establishment_id', est.id)
        .eq('status', 'pending')

      // Faturamento do dia — usa financial_entries (mesma fonte do Financeiro)
      // para manter os números consistentes entre as duas telas.
      const { data: todayEntries } = await supabase
        .from('financial_entries')
        .select('amount')
        .eq('establishment_id', est.id)
        .eq('type', 'income')
        .gte('created_at', todayStart.toISOString())

      const todayRevenue = todayEntries?.reduce((sum, e) => sum + Number(e.amount), 0) || 0
      const entriesCount = todayEntries?.length || 0
      const averageTicket = entriesCount > 0 ? todayRevenue / entriesCount : 0

      // Produtos com estoque baixo (menos de 5 unidades)
      const { count: lowStock } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('establishment_id', est.id)
        .eq('track_stock', true)
        .eq('is_active', true)
        .lte('stock_qty', 5)
        .gt('stock_qty', 0)

      // Últimos pedidos pendentes
      const { data: orders } = await supabase
        .from('orders')
        .select('*')
        .eq('establishment_id', est.id)
        .order('created_at', { ascending: false })
        .limit(5)

      setStats({
        pending_orders: pendingCount || 0,
        today_revenue: todayRevenue,
        average_ticket: averageTicket,
        low_stock_products: lowStock || 0,
      })

      if (orders) {
        setRecentOrders(orders as Order[])
      }
      log('painel:dashboard', 'dashboard carregado', {
        pendingCount,
        todayRevenue,
        lowStock,
        recentOrders: orders?.length || 0,
      })
    } catch (error) {
      logError('painel:dashboard', 'erro ao carregar dashboard', error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value)
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'badge-pending',
      confirmed: 'badge-confirmed',
      preparing: 'badge-preparing',
      completed: 'badge-completed',
      cancelled: 'badge-cancelled',
    }
    return colors[status] || 'badge-pending'
  }

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: 'Pendente',
      confirmed: 'Confirmado',
      preparing: 'Em preparo',
      completed: 'Concluído',
      cancelled: 'Cancelado',
    }
    return labels[status] || status
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Visão geral do seu negócio hoje.</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <ShoppingCart size={20} className="text-yellow-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.pending_orders}</p>
          <p className="text-sm text-gray-600">Pedidos pendentes</p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <DollarSign size={20} className="text-green-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {formatCurrency(stats.today_revenue)}
          </p>
          <p className="text-sm text-gray-600">Faturamento hoje</p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <TrendingUp size={20} className="text-blue-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {formatCurrency(stats.average_ticket)}
          </p>
          <p className="text-sm text-gray-600">Ticket médio</p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              stats.low_stock_products > 0 ? 'bg-red-100' : 'bg-gray-100'
            }`}>
              <Package size={20} className={stats.low_stock_products > 0 ? 'text-red-600' : 'text-gray-600'} />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.low_stock_products}</p>
          <p className="text-sm text-gray-600">
            {stats.low_stock_products === 1 ? 'Produto com estoque baixo' : 'Produtos com estoque baixo'}
          </p>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Pedidos Recentes</h2>
          <Link
            href="/painel/pedidos"
            className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
          >
            Ver todos
            <ArrowRight size={16} />
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <ShoppingCart size={40} className="mx-auto mb-3 text-gray-300" />
            <p>Nenhum pedido ainda.</p>
            <p className="text-sm mt-1">Compartilhe seu cardápio para começar a receber pedidos.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentOrders.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                    <span className="text-primary-700 font-medium">
                      {order.customer_name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{order.customer_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock size={12} />
                        {new Date(order.created_at).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span className={getStatusColor(order.status)}>
                        {getStatusLabel(order.status)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">
                    {formatCurrency(order.total)}
                  </p>
                  <p className="text-xs text-gray-500">{order.items.length} item(ns)</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Ações Rápidas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link
            href="/painel/produtos"
            className="flex items-center gap-3 p-4 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors"
          >
            <Package size={24} className="text-primary-600" />
            <div>
              <p className="font-medium text-primary-700">Gerenciar Produtos</p>
              <p className="text-sm text-primary-600">Adicione ou edite produtos</p>
            </div>
          </Link>
          <Link
            href="/painel/pedidos"
            className="flex items-center gap-3 p-4 bg-yellow-50 rounded-lg hover:bg-yellow-100 transition-colors"
          >
            <ShoppingCart size={24} className="text-yellow-600" />
            <div>
              <p className="font-medium text-yellow-700">Ver Pedidos</p>
              <p className="text-sm text-yellow-600">Gerencie peddos pendentes</p>
            </div>
          </Link>
          <Link
            href="/painel/balcao"
            className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <Package size={24} className="text-blue-600" />
            <div>
              <p className="font-medium text-blue-700">Balcão / PDV</p>
              <p className="text-sm text-blue-600">Venda presencial rápida</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Low stock alert */}
      {stats.low_stock_products > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800">
              {stats.low_stock_products} produto(s) com estoque baixo
            </p>
            <p className="text-sm text-amber-700 mt-1">
              Reveja os níveis de estoque para evitar faltar produtos.
            </p>
            <Link
              href="/painel/produtos"
              className="text-sm font-medium text-amber-800 hover:text-amber-900 underline mt-1 inline-block"
            >
              Ver produtos
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
