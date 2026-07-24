'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { log, logError } from '@/lib/logger'
import { generateColorShades, themeShadesToCssVars } from '@/lib/theme'
import { formatPhoneNumber } from '@/lib/phone'
import { getSavedCustomer } from '@/lib/customerStorage'
import type { OrderItem, OrderStatus } from '@/types'
import { ArrowLeft, Loader2, Search, ShoppingBag, Bike, Store, Trash2 } from 'lucide-react'

interface OrderSummary {
  id: string
  status: OrderStatus
  items: OrderItem[]
  total: number
  order_type: 'delivery' | 'pickup'
  source: 'online' | 'balcao'
  created_at: string
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmado',
  preparing: 'Em preparo',
  completed: 'Concluído',
  cancelled: 'Cancelado',
}

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  preparing: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
}

export default function MeusPedidosPage({ params }: { params: { slug: string } }) {
  const [establishment, setEstablishment] = useState<{ id: string; name: string; theme_color: string | null } | null>(null)
  const [loadingEstablishment, setLoadingEstablishment] = useState(true)
  const [phone, setPhone] = useState('')
  const [orders, setOrders] = useState<OrderSummary[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [deletingData, setDeletingData] = useState(false)

  const themeStyle = useMemo(
    () => themeShadesToCssVars(generateColorShades(establishment?.theme_color)) as React.CSSProperties,
    [establishment?.theme_color]
  )

  useEffect(() => {
    loadEstablishment()
    const saved = getSavedCustomer()
    if (saved?.phone) setPhone(saved.phone)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Se já tem telefone salvo neste navegador, busca sozinho — poupa um clique.
    if (establishment && phone && !searched) {
      handleSearch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [establishment])

  const loadEstablishment = async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('public_establishments')
        .select('id, name, theme_color')
        .eq('slug', params.slug)
        .single()

      if (error) logError('loja:meus-pedidos', 'erro ao carregar loja', error)
      setEstablishment(data)
    } catch (err) {
      logError('loja:meus-pedidos', 'exceção ao carregar loja', err)
    } finally {
      setLoadingEstablishment(false)
    }
  }

  const handleSearch = async () => {
    if (!establishment || !phone.trim()) return
    setSearching(true)
    setSearched(true)
    log('loja:meus-pedidos', 'buscando pedidos por telefone...')
    try {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_orders_by_phone', {
        p_establishment_id: establishment.id,
        p_phone: phone.trim(),
      })
      if (error) throw error
      setOrders((data || []) as OrderSummary[])
    } catch (err) {
      logError('loja:meus-pedidos', 'erro ao buscar pedidos', err)
      setOrders([])
    } finally {
      setSearching(false)
    }
  }

  const handleDeleteMyData = async () => {
    if (!establishment || !phone.trim()) return
    if (!confirm(
      'Isso apaga seu nome e endereços salvos nesta loja. Seus pedidos já feitos continuam no ' +
      'histórico da loja (registro comercial), mas nada mais fica salvo pro seu telefone. Confirmar?'
    )) return

    setDeletingData(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.rpc('delete_customer_data', {
        p_establishment_id: establishment.id,
        p_phone: phone.trim(),
      })
      if (error) throw error
      alert('Seus dados salvos foram apagados.')
    } catch (err) {
      logError('loja:meus-pedidos', 'erro ao excluir dados do cliente', err)
      alert('Não foi possível apagar seus dados agora. Tente novamente.')
    } finally {
      setDeletingData(false)
    }
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

  if (loadingEstablishment) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={32} className="animate-spin text-primary-500" />
      </div>
    )
  }

  if (!establishment) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <Store size={48} className="text-gray-300 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Loja não encontrada</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50" style={themeStyle}>
      <div className="max-w-lg mx-auto px-4 py-6">
        <Link href={`/loja/${params.slug}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft size={16} />
          Voltar ao cardápio
        </Link>

        <div className="text-center mb-6">
          <p className="text-sm text-gray-500">Meus pedidos em</p>
          <h1 className="text-xl font-bold text-gray-900">{establishment.name}</h1>
        </div>

        <div className="card mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Informe o telefone usado no pedido
          </label>
          <div className="flex gap-2">
            <input
              type="tel"
              className="input-field"
              value={phone}
              onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
              placeholder="(11) 99999-8888"
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button onClick={handleSearch} disabled={searching || !phone.trim()} className="btn-primary flex-shrink-0">
              {searching ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
            </button>
          </div>
        </div>

        {searched && !searching && orders && (
          orders.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <ShoppingBag size={40} className="mx-auto mb-3" />
              <p>Nenhum pedido encontrado com esse telefone.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => (
                <Link
                  key={order.id}
                  href={`/pedido/${order.id}`}
                  className="block bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status]}`}>
                      {STATUS_LABELS[order.status]}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(order.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">
                    {order.items.length} item(ns)
                    {order.source === 'online' && (
                      <span className="inline-flex items-center gap-1 ml-2 text-gray-400">
                        {order.order_type === 'pickup' ? <Store size={12} /> : <Bike size={12} />}
                        {order.order_type === 'pickup' ? 'Retirada' : 'Entrega'}
                      </span>
                    )}
                  </p>
                  <p className="font-bold text-primary-600">{formatCurrency(order.total)}</p>
                </Link>
              ))}
            </div>
          )
        )}

        {phone.trim() && (
          <div className="text-center mt-8">
            <button
              onClick={handleDeleteMyData}
              disabled={deletingData}
              className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500"
            >
              {deletingData ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Apagar meus dados salvos nesta loja
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
