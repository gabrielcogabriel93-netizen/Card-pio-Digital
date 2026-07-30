'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { log, logError } from '@/lib/logger'
import { generateColorShades, themeShadesToCssVars } from '@/lib/theme'
import { paymentMethodLabel } from '@/lib/paymentMethods'
import type { OrderItem, OrderStatus, DeliveryAddress } from '@/types'
import { Loader2, Clock, CheckCircle, ChefHat, XCircle, Store, Bike, MapPin, Wallet } from 'lucide-react'

interface OrderStatusData {
  id: string
  status: OrderStatus
  customer_name: string
  items: OrderItem[]
  subtotal: number
  shipping_fee: number
  discount: number
  total: number
  order_type: 'delivery' | 'pickup'
  delivery_address: DeliveryAddress | null
  payment_method: string | null
  coupon_code: string | null
  notes: string | null
  created_at: string
  establishment_name: string
  establishment_slug: string
  establishment_theme_color: string | null
  order_tracking_enabled: boolean
  payment_status: 'pending' | 'approved' | 'rejected' | 'cancelled' | null
}

const FULL_STEPS: { status: OrderStatus; label: string; icon: any }[] = [
  { status: 'pending', label: 'Pedido recebido', icon: Clock },
  { status: 'confirmed', label: 'Confirmado', icon: CheckCircle },
  { status: 'preparing', label: 'Em preparo', icon: ChefHat },
  { status: 'completed', label: 'Concluído', icon: CheckCircle },
]

// Lojas sem preparo (produto pronto) usam um acompanhamento mais curto —
// sem a etapa de "em preparo", que não existe pra elas.
const SIMPLE_STEPS: { status: OrderStatus; label: string; icon: any }[] = [
  { status: 'pending', label: 'Pedido recebido', icon: Clock },
  { status: 'completed', label: 'Concluído', icon: CheckCircle },
]

export default function OrderTrackingPage({ params }: { params: { id: string } }) {
  const [order, setOrder] = useState<OrderStatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Mesma cor de marca da loja, aplicada aqui também — sem isso a página
  // de acompanhamento ficava sempre verde, mesmo pra lojas com outra cor.
  const themeStyle = useMemo(
    () => themeShadesToCssVars(generateColorShades(order?.establishment_theme_color)) as React.CSSProperties,
    [order?.establishment_theme_color]
  )

  useEffect(() => {
    loadOrder()

    const supabase = createClient()
    const channel = supabase
      .channel(`order_tracking_${params.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${params.id}` },
        () => loadOrder()
      )
      .subscribe()

    // Reforço: se o realtime não pegar, atualiza sozinho a cada 20s.
    const interval = setInterval(loadOrder, 20000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  const loadOrder = async () => {
    log('pedido', 'consultando status do pedido...', { id: params.id })
    try {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_order_status', { p_order_id: params.id })

      if (error) throw error
      const result = data?.[0]

      if (!result) {
        setNotFound(true)
        return
      }

      setOrder(result)
    } catch (error) {
      logError('pedido', 'erro ao consultar pedido', error)
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={32} className="animate-spin text-primary-500" />
      </div>
    )
  }

  if (notFound || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <Store size={48} className="text-gray-300 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Pedido não encontrado</h1>
          <p className="text-gray-600">Confira se o link está correto.</p>
        </div>
      </div>
    )
  }

  const STEPS = order.order_tracking_enabled ? FULL_STEPS : SIMPLE_STEPS
  const currentStepIndex = Math.max(0, STEPS.findIndex((s) => s.status === order.status))
  const isCancelled = order.status === 'cancelled'

  return (
    <div className="min-h-screen bg-gray-50" style={themeStyle}>
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="text-center mb-6">
          <p className="text-sm text-gray-500">Pedido em</p>
          <h1 className="text-xl font-bold text-gray-900">{order.establishment_name}</h1>
        </div>

        {order.order_type && (
          <div className="flex items-center justify-center gap-2 mb-4 text-sm text-gray-600">
            {order.order_type === 'pickup' ? <Store size={14} /> : <Bike size={14} />}
            <span>{order.order_type === 'pickup' ? 'Retirada no local' : 'Entrega'}</span>
            {order.order_type === 'delivery' && order.delivery_address && (
              <span className="flex items-center gap-1 text-gray-400">
                <MapPin size={12} />
                {order.delivery_address.street}, {order.delivery_address.number} - {order.delivery_address.neighborhood}
              </span>
            )}
          </div>
        )}

        {/* Status timeline */}
        <div className="card mb-4">
          {isCancelled ? (
            <div className="flex items-center gap-3 text-red-600">
              <XCircle size={24} />
              <div>
                <p className="font-semibold">Pedido cancelado</p>
                <p className="text-sm text-gray-500">Fale com a loja se tiver dúvidas.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {STEPS.map((step, index) => {
                const done = index <= currentStepIndex
                const isCurrent = index === currentStepIndex
                return (
                  <div key={step.status} className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                        done ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      <step.icon size={16} />
                    </div>
                    <div>
                      <p className={`text-sm font-medium ${done ? 'text-gray-900' : 'text-gray-400'}`}>
                        {step.label}
                      </p>
                      {isCurrent && <p className="text-xs text-primary-600">Status atual</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Items */}
        <div className="card mb-4">
          <h2 className="text-sm font-medium text-gray-700 mb-3">Itens do pedido</h2>
          <div className="space-y-2">
            {order.items.map((item, index) => (
              <div key={index} className="flex justify-between text-sm">
                <span>{item.quantity}x {item.product_name}</span>
                <span className="text-gray-600">{formatCurrency(item.total_price)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-100 mt-3 pt-3 space-y-1">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span>{formatCurrency(order.subtotal)}</span>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between text-sm text-primary-600">
                <span>Desconto{order.coupon_code ? ` (${order.coupon_code})` : ''}</span>
                <span>-{formatCurrency(order.discount)}</span>
              </div>
            )}
            {order.shipping_fee > 0 && (
              <div className="flex justify-between text-sm text-gray-600">
                <span>Taxa de entrega</span>
                <span>{formatCurrency(order.shipping_fee)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold pt-1">
              <span>Total</span>
              <span className="text-primary-600">{formatCurrency(order.total)}</span>
            </div>
            {order.payment_method && (
              <div className="flex justify-between text-sm text-gray-600 pt-1">
                <span className="flex items-center gap-1"><Wallet size={12} /> Pagamento</span>
                <span className="flex items-center gap-1.5">
                  {paymentMethodLabel(order.payment_method)}
                  {order.payment_method === 'mercadopago_pix' && (
                    order.payment_status === 'approved' ? (
                      <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">✅ Pago</span>
                    ) : (
                      <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">⏳ Aguardando</span>
                    )
                  )}
                </span>
              </div>
            )}
          </div>
        </div>

        {order.notes && (
          <div className="card mb-4">
            <h2 className="text-sm font-medium text-gray-700 mb-1">Observações</h2>
            <p className="text-sm text-gray-600">{order.notes}</p>
          </div>
        )}

        <Link href={`/loja/${order.establishment_slug}`} className="btn-secondary w-full">
          Voltar ao cardápio
        </Link>
      </div>
    </div>
  )
}
