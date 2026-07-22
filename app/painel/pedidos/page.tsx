'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { log, logError } from '@/lib/logger'
import type { Order, OrderItem } from '@/types'
import { Loader2, Clock, CheckCircle, ChefHat, XCircle, ArrowRight, DollarSign, ExternalLink, Search } from 'lucide-react'

// Classes estáticas (o Tailwind não inclui classes montadas dinamicamente
// como `bg-${color}-50` no build de produção, então mapeamos aqui).
const columnStyles = {
  yellow: { bg: 'bg-yellow-50', icon: 'text-yellow-600', title: 'text-yellow-800', badge: 'bg-yellow-200 text-yellow-800' },
  blue: { bg: 'bg-blue-50', icon: 'text-blue-600', title: 'text-blue-800', badge: 'bg-blue-200 text-blue-800' },
  purple: { bg: 'bg-purple-50', icon: 'text-purple-600', title: 'text-purple-800', badge: 'bg-purple-200 text-purple-800' },
  green: { bg: 'bg-green-50', icon: 'text-green-600', title: 'text-green-800', badge: 'bg-green-200 text-green-800' },
  red: { bg: 'bg-red-50', icon: 'text-red-600', title: 'text-red-800', badge: 'bg-red-200 text-red-800' },
} as const

export default function PedidosPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [shippingFee, setShippingFee] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [saving, setSaving] = useState(false)

  const columns: { status: Order['status']; label: string; icon: any; color: keyof typeof columnStyles }[] = [
    { status: 'pending', label: 'Pendente', icon: Clock, color: 'yellow' },
    { status: 'confirmed', label: 'Confirmado', icon: CheckCircle, color: 'blue' },
    { status: 'preparing', label: 'Em Preparo', icon: ChefHat, color: 'purple' },
    { status: 'completed', label: 'Concluído', icon: CheckCircle, color: 'green' },
    { status: 'cancelled', label: 'Cancelado', icon: XCircle, color: 'red' },
  ]

  useEffect(() => {
    loadOrders()

    // Subscribe to real-time changes
    const supabase = createClient()
    const channel = supabase
      .channel('orders_channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          log('painel:pedidos', 'evento realtime recebido', { eventType: payload.eventType })
          loadOrders()
        }
      )
      .subscribe((status) => {
        log('painel:pedidos', 'status da inscrição realtime', { status })
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const loadOrders = async () => {
    log('painel:pedidos', 'carregando pedidos...')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: est, error: estError } = await supabase
        .from('establishments')
        .select('id')
        .eq('owner_id', user.id)
        .single()

      if (estError) logError('painel:pedidos', 'erro ao buscar estabelecimento', estError)
      if (!est) return

      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('establishment_id', est.id)
        .order('created_at', { ascending: false })

      if (error) logError('painel:pedidos', 'erro ao carregar pedidos', error)
      if (data) setOrders(data as Order[])
      log('painel:pedidos', 'pedidos carregados', { total: data?.length || 0 })
    } catch (error) {
      logError('painel:pedidos', 'exceção ao carregar pedidos', error)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenOrder = (order: Order) => {
    setSelectedOrder(order)
    setShippingFee(order.shipping_fee > 0 ? String(order.shipping_fee) : '')
    setPaymentMethod(order.payment_method || '')
    setShowModal(true)
  }

  const handleUpdateStatus = async (orderId: string, newStatus: Order['status']) => {
    setSaving(true)
    log('painel:pedidos', 'atualizando status do pedido', { orderId, newStatus, statusAnterior: selectedOrder?.status })
    try {
      const supabase = createClient()
      const wasStockAlreadyDeducted =
        selectedOrder?.status === 'confirmed' || selectedOrder?.status === 'preparing'

      const updateData: any = { status: newStatus }

      if (newStatus === 'confirmed') {
        // O frete só é definido na confirmação — o total precisa ser
        // recalculado aqui, senão a entrada financeira e o pedido ficam
        // subestimados pelo valor do frete.
        const finalShippingFee = parseFloat(shippingFee) || 0
        const finalTotal = (selectedOrder?.subtotal || 0) + finalShippingFee

        updateData.payment_method = paymentMethod
        updateData.shipping_fee = finalShippingFee
        updateData.total = finalTotal

        // Confirmar pedido - criar entrada financeira
        log('painel:pedidos', 'criando entrada financeira da confirmação', { finalTotal })
        const { error: financeError } = await supabase.from('financial_entries').insert({
          establishment_id: selectedOrder?.establishment_id,
          order_id: orderId,
          type: 'income',
          amount: finalTotal,
          description: `Pedido #${orderId.slice(0, 8)} - ${selectedOrder?.customer_name}`,
        })
        if (financeError) throw financeError

        // Baixar estoque
        log('painel:pedidos', 'baixando estoque dos itens do pedido')
        await adjustStockForItems(selectedOrder?.items || [], 'decrement')
      }

      // Cancelamento após a baixa de estoque já ter ocorrido: estorna o
      // estoque e remove a entrada financeira lançada na confirmação.
      if (newStatus === 'cancelled' && wasStockAlreadyDeducted) {
        log('painel:pedidos', 'estornando estoque e removendo entrada financeira (cancelamento)')
        await adjustStockForItems(selectedOrder?.items || [], 'increment')
        const { error: deleteFinanceError } = await supabase
          .from('financial_entries')
          .delete()
          .eq('order_id', orderId)
        if (deleteFinanceError) throw deleteFinanceError
      }

      const { error: updateError } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', orderId)
      if (updateError) throw updateError

      log('painel:pedidos', 'status do pedido atualizado com sucesso')
      setShowModal(false)
      setSelectedOrder(null)
      await loadOrders()
    } catch (error: any) {
      logError('painel:pedidos', 'erro ao atualizar status do pedido', error)
      alert('Erro ao atualizar pedido: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const adjustStockForItems = async (items: OrderItem[], direction: 'decrement' | 'increment') => {
    const supabase = createClient()
    const rpcName = direction === 'decrement' ? 'decrement_product_stock' : 'increment_product_stock'

    for (const item of items) {
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('track_stock')
        .eq('id', item.product_id)
        .single()

      if (productError) {
        logError('painel:pedidos', 'erro ao buscar produto para ajuste de estoque', productError)
        continue
      }

      if (product?.track_stock) {
        const { error: rpcError } = await supabase.rpc(rpcName, {
          product_id: item.product_id,
          quantity: item.quantity,
        })
        if (rpcError) logError('painel:pedidos', `erro ao chamar ${rpcName}`, rpcError)
      }
    }
  }

  const getOrdersByStatus = (status: Order['status']) => {
    return orders.filter((o) => o.status === status)
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pedidos</h1>
        <p className="text-gray-600 mt-1">Gerencie os pedidos dos seus clientes.</p>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 overflow-x-auto pb-4">
        {columns.map((column) => {
          const columnOrders = getOrdersByStatus(column.status)
          const style = columnStyles[column.color]
          return (
            <div key={column.status} className="min-w-[280px]">
              <div className={`${style.bg} rounded-lg p-4`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <column.icon size={16} className={style.icon} />
                    <h3 className={`font-medium ${style.title} text-sm`}>{column.label}</h3>
                  </div>
                  <span className={`${style.badge} text-xs font-medium px-2 py-0.5 rounded-full`}>
                    {columnOrders.length}
                  </span>
                </div>

                <div className="space-y-3 min-h-[200px]">
                  {columnOrders.map((order) => (
                    <button
                      key={order.id}
                      onClick={() => handleOpenOrder(order)}
                      className="w-full text-left bg-white rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow border border-gray-100"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                            <span className="text-primary-700 font-medium text-sm">
                              {order.customer_name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 truncate max-w-[120px]">
                              {order.customer_name}
                            </p>
                            <p className="text-xs text-gray-500">{order.items.length} item(ns)</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-primary-600">
                          {formatCurrency(order.total)}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(order.created_at).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      {order.source === 'balcao' && (
                        <span className="text-xs text-blue-500 mt-1 inline-block">Balcão</span>
                      )}
                    </button>
                  ))}
                  {columnOrders.length === 0 && (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      Nenhum pedido
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Order Detail Modal */}
      {showModal && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-fade-in">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Detalhes do Pedido</h2>
                  <p className="text-sm text-gray-500">
                    {selectedOrder.customer_name} - {selectedOrder.customer_phone}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Items */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Itens do Pedido</h3>
                <div className="space-y-3">
                  {selectedOrder.items.map((item: OrderItem, index: number) => (
                    <div key={index} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900">{item.product_name}</p>
                        <p className="text-sm text-gray-500">Qtd: {item.quantity} x {formatCurrency(item.unit_price)}</p>
                        {item.variations && item.variations.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {item.variations.map((v, i) => (
                              <p key={i} className="text-xs text-gray-500">
                                {v.group_name}: {v.option_name} {v.price_delta > 0 && `(+${formatCurrency(v.price_delta)})`}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="font-medium text-gray-900">{formatCurrency(item.total_price)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="border-t border-gray-200 pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal</span>
                  <span>{formatCurrency(selectedOrder.subtotal)}</span>
                </div>
                {(selectedOrder.status === 'confirmed' || selectedOrder.status !== 'pending') && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Frete</span>
                    <span>{formatCurrency(selectedOrder.shipping_fee || 0)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg border-t border-gray-200 pt-2">
                  <span>Total</span>
                  <span className="text-primary-600">{formatCurrency(selectedOrder.total)}</span>
                </div>
              </div>

              {/* Actions for pending orders */}
              {selectedOrder.status === 'pending' && (
                <div className="border-t border-gray-200 pt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Frete</label>
                      <input
                        type="number"
                        step="0.01"
                        className="input-field"
                        value={shippingFee}
                        onChange={(e) => setShippingFee(e.target.value)}
                        placeholder="0,00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Pagamento</label>
                      <select
                        className="input-field"
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                      >
                        <option value="">Selecione</option>
                        <option value="dinheiro">Dinheiro</option>
                        <option value="cartao_credito">Cartão de Crédito</option>
                        <option value="cartao_debito">Cartão de Débito</option>
                        <option value="pix">PIX</option>
                        <option value="outro">Outro</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => handleUpdateStatus(selectedOrder.id, 'cancelled')}
                      className="btn-danger flex-1"
                      disabled={saving}
                    >
                      {saving ? <Loader2 size={18} className="animate-spin" /> : 'Cancelar Pedido'}
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(selectedOrder.id, 'confirmed')}
                      className="btn-primary flex-1"
                      disabled={saving}
                    >
                      {saving ? <Loader2 size={18} className="animate-spin" /> : 'Confirmar Pedido'}
                    </button>
                  </div>
                </div>
              )}

              {/* Status change for confirmed/preparing */}
              {(selectedOrder.status === 'confirmed' || selectedOrder.status === 'preparing') && (
                <div className="border-t border-gray-200 pt-4 flex gap-3">
                  <button
                    onClick={() => {
                      if (confirm('Cancelar este pedido? O estoque baixado será estornado.')) {
                        handleUpdateStatus(selectedOrder.id, 'cancelled')
                      }
                    }}
                    className="btn-danger flex-1"
                    disabled={saving}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(
                      selectedOrder.id,
                      selectedOrder.status === 'confirmed' ? 'preparing' : 'completed'
                    )}
                    className="btn-primary flex-1"
                    disabled={saving}
                  >
                    {saving ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : selectedOrder.status === 'confirmed' ? (
                      'Iniciar Preparo'
                    ) : (
                      'Concluir Pedido'
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
