'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { logError } from '@/lib/logger'
import { generateColorShades, themeShadesToCssVars } from '@/lib/theme'
import { paymentMethodLabel } from '@/lib/paymentMethods'
import { toWhatsAppNumber } from '@/lib/phone'
import { formatBRL } from '@/lib/money'
import { buildOrderTimeline, estimateArrival } from '@/lib/orderTimeline'
import { orderItemsToPayload } from '@/lib/orderPayload'
import { saveReorder } from '@/lib/customerStorage'
import { OrderPushNotificationToggle } from '@/components/OrderPushNotificationToggle'
import { MercadoPagoPixCheckout } from '@/components/MercadoPagoPixCheckout'
import { SmartImage } from '@/components/SmartImage'
import type { OrderItem, OrderStatus, DeliveryAddress } from '@/types'
import { Loader2, CheckCircle2, XCircle, Store, Bike, MapPin, Send, RotateCcw, Star, Circle } from 'lucide-react'

interface OrderStatusData {
  id: string
  status: OrderStatus
  customer_name: string
  items: OrderItem[]
  subtotal: number
  shipping_fee: number
  discount: number
  total: number
  order_type: 'delivery' | 'pickup' | 'mesa'
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
  cancellation_reason: string | null
  accepted_at: string | null
  dispatched_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  eta_minutes: number | null
  change_for: number | null
  establishment_whatsapp: string
  establishment_logo_url: string | null
  google_review_url: string | null
  customer_rating: number | null
  establishment_id: string
}

const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

export default function OrderTrackingPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [order, setOrder] = useState<OrderStatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [retryCheckout, setRetryCheckout] = useState<{ qrCode: string; qrCodeBase64: string } | null>(null)
  const [retryLoading, setRetryLoading] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)
  const [rating, setRating] = useState(0)
  const [reviewText, setReviewText] = useState('')
  const [reviewSent, setReviewSent] = useState(false)
  const [reviewSaving, setReviewSaving] = useState(false)
  const hasLoadedRef = useRef(false)

  const themeStyle = useMemo(
    () => themeShadesToCssVars(generateColorShades(order?.establishment_theme_color)) as React.CSSProperties,
    [order?.establishment_theme_color]
  )

  const loadOrder = useCallback(async () => {
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
      hasLoadedRef.current = true
    } catch (error) {
      logError('pedido', 'erro ao consultar pedido', error)
      // Falha de rede numa atualização não derruba a tela já carregada.
      if (!hasLoadedRef.current) setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [params.id])

  // Atualiza a cada 8s com a aba visível (o realtime não chega ao cliente
  // anônimo por causa do RLS) e na hora em que a aba volta ao foco.
  useEffect(() => {
    loadOrder()
    const tick = () => {
      if (document.visibilityState === 'visible') loadOrder()
    }
    const interval = setInterval(tick, 8000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [loadOrder])

  const handleGenerateNewPix = async () => {
    if (!order) return
    setRetryLoading(true)
    setRetryError(null)
    try {
      const response = await fetch('/api/mercadopago/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Erro ao gerar o Pix')
      setRetryCheckout({ qrCode: data.qrCode, qrCodeBase64: data.qrCodeBase64 })
    } catch (err: any) {
      logError('pedido', 'erro ao gerar novo Pix', err)
      setRetryError(err.message || 'Erro ao gerar o Pix')
    } finally {
      setRetryLoading(false)
    }
  }

  const handleReorder = () => {
    if (!order) return
    saveReorder(order.establishment_id, orderItemsToPayload(order.items))
    router.push(`/loja/${order.establishment_slug}`)
  }

  const sendReview = async () => {
    if (!order || rating < 1) return
    setReviewSaving(true)
    const supabase = createClient()
    const { error } = await supabase.rpc('submit_order_review', { p_order_id: order.id, p_rating: rating, p_comment: reviewText.trim() || null })
    setReviewSaving(false)
    if (!error) {
      setReviewSent(true)
      loadOrder()
    }
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
          <h1 className="font-display text-xl font-bold text-gray-900 mb-2">Pedido não encontrado</h1>
          <p className="text-gray-600">Confira se o link está correto.</p>
        </div>
      </div>
    )
  }

  const isCancelled = order.status === 'cancelled'
  const steps = buildOrderTimeline(order)
  const eta = estimateArrival(order)
  const awaitingPix = order.payment_method === 'mercadopago_pix' && order.status === 'pending' && order.payment_status !== 'approved'
  const waLink = `https://wa.me/${toWhatsAppNumber(order.establishment_whatsapp)}?text=${encodeURIComponent(`Oi! Sobre meu pedido #${order.id.slice(0, 8)}:`)}`
  const headline = isCancelled
    ? 'Pedido cancelado'
    : order.status === 'completed'
      ? order.order_type === 'delivery' ? 'Pedido entregue' : 'Pedido concluído'
      : order.dispatched_at
        ? order.order_type === 'delivery' ? 'Saiu para entrega' : 'Pronto para retirar'
        : order.status === 'pending'
          ? awaitingPix ? 'Aguardando o Pix' : 'Aguardando a loja aceitar'
          : 'Preparando seu pedido'

  return (
    <div className="min-h-screen bg-gray-50" style={themeStyle}>
      <div className="bg-primary-500 text-white">
        <div className="max-w-lg mx-auto px-4 pt-6 pb-16">
          <div className="flex items-center gap-3">
            {order.establishment_logo_url ? (
              <div className="relative w-11 h-11 rounded-xl overflow-hidden bg-white flex-shrink-0">
                <SmartImage src={order.establishment_logo_url} alt={order.establishment_name} fill sizes="44px" className="object-cover" />
              </div>
            ) : null}
            <div className="min-w-0">
              <p className="text-sm opacity-90">{order.establishment_name}</p>
              <p className="font-mono text-xs opacity-75">Pedido #{order.id.slice(0, 8)}</p>
            </div>
          </div>
          <h1 className="font-display text-3xl font-extrabold mt-5">{headline}</h1>
          {eta && !order.dispatched_at && <p className="text-lg mt-1">Previsão: <strong className="tabular-nums">{eta}</strong></p>}
          {eta && order.dispatched_at && order.order_type === 'delivery' && <p className="text-lg mt-1">Chega até <strong className="tabular-nums">{eta.split(' – ')[1]}</strong></p>}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 -mt-10 pb-10 space-y-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          {isCancelled ? (
            <div className="flex items-start gap-3 text-red-600">
              <XCircle size={24} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">A loja cancelou este pedido</p>
                <p className="text-sm text-gray-600 mt-1">{order.cancellation_reason ? <>Motivo: {order.cancellation_reason}</> : 'Fale com a loja se tiver dúvidas.'}</p>
              </div>
            </div>
          ) : (
            <ol className="space-y-0">
              {steps.map((step, i) => (
                <li key={step.key} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${step.state === 'done' ? 'bg-primary-500 text-white' : step.state === 'current' ? 'bg-comanda text-ink ring-4 ring-amber-100' : 'bg-gray-100 text-gray-300'}`}>
                      {step.state === 'done' ? <CheckCircle2 size={14} /> : <Circle size={8} fill="currentColor" />}
                    </span>
                    {i < steps.length - 1 && <span className={`w-0.5 flex-1 min-h-[22px] ${step.state === 'done' ? 'bg-primary-300' : 'bg-gray-100'}`} />}
                  </div>
                  <div className="pb-4">
                    <p className={`text-sm font-medium ${step.state === 'todo' ? 'text-gray-400' : 'text-gray-900'}`}>{step.label}</p>
                    {step.at && <p className="text-xs text-gray-500 tabular-nums">{timeFmt.format(new Date(step.at))}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
          <div className="grid grid-cols-2 gap-2 mt-2">
            <a href={waLink} target="_blank" rel="noopener noreferrer" className="btn-secondary text-sm py-2.5"><Send size={15} /> Falar com a loja</a>
            <button onClick={handleReorder} className="btn-primary text-sm py-2.5"><RotateCcw size={15} /> Pedir de novo</button>
          </div>
        </div>

        {!isCancelled && order.status !== 'completed' && <OrderPushNotificationToggle orderId={order.id} />}

        {awaitingPix && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <p className="text-sm text-gray-700 mb-3">
              {order.payment_status === 'rejected' || order.payment_status === 'cancelled'
                ? 'O pagamento não foi aprovado. Gere um novo Pix para tentar de novo.'
                : 'Ainda não identificamos o pagamento. Se preferir, gere um novo Pix.'}
            </p>
            <button onClick={handleGenerateNewPix} disabled={retryLoading} className="btn-primary w-full">
              {retryLoading ? <Loader2 size={18} className="animate-spin" /> : 'Gerar Pix para pagar'}
            </button>
            {retryError && <p className="text-xs text-red-600 mt-2">{retryError}</p>}
          </div>
        )}

        {order.status === 'completed' && !order.customer_rating && !reviewSent && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center">
            <p className="font-semibold text-gray-900">Como foi seu pedido?</p>
            <div className="flex justify-center gap-1 mt-3" role="radiogroup" aria-label="Nota de 1 a 5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} role="radio" aria-checked={rating === n} onClick={() => setRating(n)} className="p-1" aria-label={`${n} estrela${n > 1 ? 's' : ''}`}>
                  <Star size={32} className={n <= rating ? 'text-amber-400' : 'text-gray-200'} fill="currentColor" />
                </button>
              ))}
            </div>
            {rating > 0 && (
              <>
                <textarea className="input-field text-sm mt-3" rows={2} maxLength={500} value={reviewText} onChange={(e) => setReviewText(e.target.value)} placeholder={rating >= 4 ? 'O que você mais gostou? (opcional)' : 'O que podemos melhorar? (opcional)'} />
                <button onClick={sendReview} disabled={reviewSaving} className="btn-primary w-full mt-3">{reviewSaving ? <Loader2 size={18} className="animate-spin" /> : 'Enviar avaliação'}</button>
              </>
            )}
          </div>
        )}
        {(reviewSent || order.customer_rating) && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center">
            <p className="font-semibold text-gray-900">Obrigado pela avaliação!</p>
            {(order.customer_rating || rating) >= 4 && order.google_review_url && (
              <a href={order.google_review_url} target="_blank" rel="noopener noreferrer" className="btn-secondary w-full mt-3">Avaliar a {order.establishment_name} no Google</a>
            )}
          </div>
        )}

        {retryCheckout && (
          <MercadoPagoPixCheckout
            orderId={order.id}
            amount={order.total}
            qrCode={retryCheckout.qrCode}
            qrCodeBase64={retryCheckout.qrCodeBase64}
            trackingUrl={typeof window !== 'undefined' ? window.location.href : ''}
            onClose={() => setRetryCheckout(null)}
          />
        )}

        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
            {order.order_type === 'delivery' ? <Bike size={15} /> : <Store size={15} />}
            <span>{order.order_type === 'delivery' ? 'Entrega' : order.order_type === 'mesa' ? 'Pedido na mesa' : 'Retirada no local'}</span>
          </div>
          {order.order_type === 'delivery' && order.delivery_address && (
            <p className="text-sm text-gray-700 flex items-start gap-1.5 mb-3">
              <MapPin size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
              {order.delivery_address.street}, {order.delivery_address.number}
              {order.delivery_address.complement ? ` - ${order.delivery_address.complement}` : ''} · {order.delivery_address.neighborhood}
            </p>
          )}
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Itens</h2>
          <div className="space-y-2">
            {order.items.map((item, index) => (
              <div key={index} className="text-sm">
                <div className="flex justify-between">
                  <span>{item.quantity}x {item.product_name}</span>
                  <span className="text-gray-600 tabular-nums">{formatBRL(item.total_price)}</span>
                </div>
                {item.variations && item.variations.length > 0 && (
                  <p className="text-xs text-gray-500">{item.variations.map((v) => v.option_name).join(', ')}</p>
                )}
                {item.note && <p className="text-xs text-gray-500 italic">&ldquo;{item.note}&rdquo;</p>}
              </div>
            ))}
          </div>
          <div className="border-t border-gray-100 mt-3 pt-3 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600"><span>Subtotal</span><span className="tabular-nums">{formatBRL(order.subtotal)}</span></div>
            {order.discount > 0 && (
              <div className="flex justify-between text-green-700"><span>Desconto{order.coupon_code ? ` (${order.coupon_code})` : ''}</span><span className="tabular-nums">-{formatBRL(order.discount)}</span></div>
            )}
            {order.order_type === 'delivery' && (
              <div className="flex justify-between text-gray-600"><span>Entrega</span><span className="tabular-nums">{order.shipping_fee > 0 ? formatBRL(order.shipping_fee) : 'Grátis'}</span></div>
            )}
            <div className="flex justify-between font-bold pt-1"><span>Total</span><span className="tabular-nums">{formatBRL(order.total)}</span></div>
            {order.payment_method && (
              <div className="flex justify-between text-gray-600 pt-1">
                <span>Pagamento</span>
                <span className="flex items-center gap-1.5">
                  {paymentMethodLabel(order.payment_method)}
                  {order.payment_method === 'dinheiro' && order.change_for ? ` · troco p/ ${formatBRL(order.change_for)}` : ''}
                  {order.payment_method === 'mercadopago_pix' && (
                    order.payment_status === 'approved' ? <span className="text-xs text-green-700 bg-green-50 px-1.5 py-0.5 rounded">Pago</span>
                      : order.payment_status === 'rejected' || order.payment_status === 'cancelled' ? <span className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Não aprovado</span>
                        : <span className="text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">Aguardando</span>
                  )}
                </span>
              </div>
            )}
          </div>
          {order.notes && <p className="text-sm text-gray-600 mt-3"><span className="font-medium text-gray-700">Observações:</span> {order.notes}</p>}
        </div>

        <Link href={`/loja/${order.establishment_slug}`} className="btn-secondary w-full">Voltar ao cardápio</Link>
      </div>
    </div>
  )
}
