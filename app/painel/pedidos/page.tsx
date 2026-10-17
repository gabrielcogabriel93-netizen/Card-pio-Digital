'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { log, logError, logCritical } from '@/lib/logger'
import { startAlarm, stopAlarm, isAudioBlocked, unlockAudio } from '@/lib/sound'
import { useEscapeKey } from '@/lib/useEscapeKey'
import { PushNotificationToggle } from '@/components/PushNotificationToggle'
import { AutoPrintToggle } from '@/components/AutoPrintToggle'
import { PAYMENT_METHODS, paymentMethodLabel } from '@/lib/paymentMethods'
import { STATUS_NOTIFICATION_MESSAGES, type NotifiableStep } from '@/lib/orderStatusMessages'
import { toWhatsAppNumber } from '@/lib/phone'
import { formatBRL } from '@/lib/money'
import { buildReceiptText, rawbtPrintUrl, type PaperWidth } from '@/lib/receipt'
import { toast, confirmDialog } from '@/components/Feedback'
import type { Order, OrderItem, OrderAutomationMode } from '@/types'
import {
  Loader2, Clock, CheckCircle, ChefHat, XCircle, Search, Printer, Bike, Store, MapPin, Wallet, Bot, Table2,
  BellRing, Volume2, Send, PackageCheck, MessageCircle,
} from 'lucide-react'

// Sem paginação ainda: os 200 mais recentes cobrem o dia de qualquer loja.
const MAX_ORDERS = 200
const ETA_CHOICES = [20, 35, 50]
const PAPER_KEY = 'painel:paper-width'

const columnStyles = {
  yellow: { bg: 'bg-amber-50', icon: 'text-amber-600', title: 'text-amber-900', badge: 'bg-amber-200 text-amber-900' },
  blue: { bg: 'bg-blue-50', icon: 'text-blue-600', title: 'text-blue-900', badge: 'bg-blue-200 text-blue-900' },
  purple: { bg: 'bg-purple-50', icon: 'text-purple-600', title: 'text-purple-900', badge: 'bg-purple-200 text-purple-900' },
  green: { bg: 'bg-green-50', icon: 'text-green-600', title: 'text-green-900', badge: 'bg-green-200 text-green-900' },
  red: { bg: 'bg-red-50', icon: 'text-red-600', title: 'text-red-900', badge: 'bg-red-200 text-red-900' },
} as const

const minutesSince = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))

export default function PedidosPage() {
  const supabase = useMemo(() => createClient(), [])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [shippingFee, setShippingFee] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [etaMinutes, setEtaMinutes] = useState<number>(35)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [trackingEnabled, setTrackingEnabled] = useState(true)
  const [establishmentId, setEstablishmentId] = useState('')
  const [establishmentName, setEstablishmentName] = useState('')
  const [whatsappNotificationsEnabled, setWhatsappNotificationsEnabled] = useState(false)
  const [tableLabelByTabId, setTableLabelByTabId] = useState<Map<string, string>>(new Map())
  const [printOrder, setPrintOrder] = useState<Order | null>(null)
  const [autoPrintEnabled, setAutoPrintEnabled] = useState<boolean | null>(null)
  const [printerLabel, setPrinterLabel] = useState('')
  const [paperWidth, setPaperWidth] = useState<PaperWidth>(80)
  const [orderAutomationMode, setOrderAutomationMode] = useState<OrderAutomationMode>('manual')
  const [cronLastRunAt, setCronLastRunAt] = useState<string | null>(null)
  const [cancelPrompt, setCancelPrompt] = useState<{ orderId: string; warning: string } | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  // Pedidos novos que ninguém abriu ainda: enquanto houver algum, a
  // campainha toca.
  const [unseen, setUnseen] = useState<Set<string>>(new Set())
  const [audioBlocked, setAudioBlocked] = useState(false)
  const [, forceTick] = useState(0)
  const autoPrintRef = useRef<boolean | null>(null)
  const establishmentIdRef = useRef('')

  useEffect(() => {
    autoPrintRef.current = autoPrintEnabled
  }, [autoPrintEnabled])

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(PAPER_KEY))
      if (saved === 58 || saved === 80) setPaperWidth(saved)
    } catch {}
    // Atualiza o "há X min" dos cards.
    const t = setInterval(() => forceTick((n) => n + 1), 30000)
    // O navegador só libera som depois de um toque: o primeiro clique em
    // qualquer lugar da tela já deixa a campainha pronta.
    const unlock = () => {
      unlockAudio().then((ok) => ok && setAudioBlocked(false))
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    return () => {
      clearInterval(t)
      window.removeEventListener('pointerdown', unlock)
    }
  }, [])

  const allColumns: { status: Order['status']; label: string; icon: any; color: keyof typeof columnStyles }[] = [
    { status: 'pending', label: 'Novos', icon: Clock, color: 'yellow' },
    { status: 'confirmed', label: 'Aceitos', icon: CheckCircle, color: 'blue' },
    { status: 'preparing', label: 'Em preparo', icon: ChefHat, color: 'purple' },
    { status: 'completed', label: 'Concluídos', icon: PackageCheck, color: 'green' },
    { status: 'cancelled', label: 'Cancelados', icon: XCircle, color: 'red' },
  ]
  const columns = trackingEnabled ? allColumns : allColumns.filter((c) => ['pending', 'completed', 'cancelled'].includes(c.status))

  useEscapeKey(() => setSelectedOrder(null), !!selectedOrder && !cancelPrompt)
  useEscapeKey(() => setCancelPrompt(null), !!cancelPrompt)

  const loadOrders = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: est, error: estError } = await supabase
        .from('establishments')
        .select('id, name, order_tracking_enabled, whatsapp_notifications_enabled, auto_print_enabled, printer_label, order_automation_mode')
        .eq('owner_id', user.id)
        .single()
      if (estError) logError('painel:pedidos', 'erro ao buscar estabelecimento', estError)
      if (!est) return

      establishmentIdRef.current = est.id
      setEstablishmentId(est.id)
      setEstablishmentName(est.name)
      setTrackingEnabled(est.order_tracking_enabled ?? true)
      setWhatsappNotificationsEnabled(est.whatsapp_notifications_enabled ?? false)
      setAutoPrintEnabled(est.auto_print_enabled ?? null)
      setPrinterLabel(est.printer_label || '')
      setOrderAutomationMode(est.order_automation_mode || 'manual')

      if ((est.order_automation_mode || 'manual') === 'automatic') {
        const { data: health } = await supabase.from('cron_health').select('last_run_at').eq('job_name', 'advance-automatic-orders').maybeSingle()
        setCronLastRunAt(health?.last_run_at ?? null)
      }

      const [{ data, error }, { data: tabsData }] = await Promise.all([
        supabase.from('orders').select('*').eq('establishment_id', est.id).order('created_at', { ascending: false }).limit(MAX_ORDERS),
        supabase.from('table_tabs').select('id, restaurant_tables(label)').eq('establishment_id', est.id),
      ])
      if (error) logError('painel:pedidos', 'erro ao carregar pedidos', error)
      if (data) setOrders(data as Order[])
      if (tabsData) setTableLabelByTabId(new Map(tabsData.map((t: any) => [t.id, t.restaurant_tables?.label || '?'])))
    } catch (error) {
      logError('painel:pedidos', 'exceção ao carregar pedidos', error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  // Tempo real filtrado pela loja: atualiza só o pedido que mudou (antes
  // cada evento recarregava tudo).
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    loadOrders().then(() => {
      const estId = establishmentIdRef.current
      if (!estId) return
      channel = supabase
        .channel(`orders_${estId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `establishment_id=eq.${estId}` }, (payload) => {
          if (payload.eventType === 'INSERT') {
            const newOrder = payload.new as Order
            setOrders((prev) => [newOrder, ...prev.filter((o) => o.id !== newOrder.id)].slice(0, MAX_ORDERS))
            if (newOrder.source !== 'balcao') {
              setUnseen((prev) => new Set(prev).add(newOrder.id))
              if (autoPrintRef.current === true) setPrintOrder({ ...newOrder })
              if (document.visibilityState !== 'visible' && 'Notification' in window && Notification.permission === 'granted') {
                try {
                  new Notification('Novo pedido!', { body: `${newOrder.customer_name} · ${formatBRL(Number(newOrder.total))}`, tag: newOrder.id })
                } catch {}
              }
            }
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Order
            setOrders((prev) => prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)))
            setSelectedOrder((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev))
          }
        })
        .subscribe((status) => log('painel:pedidos', 'realtime', { status }))
    })
    // Rede de segurança: no celular a conexão em tempo real cai quando o
    // app vai para segundo plano.
    const interval = setInterval(loadOrders, 60000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadOrders()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      if (channel) supabase.removeChannel(channel)
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      stopAlarm()
    }
  }, [loadOrders, supabase])

  // Campainha enquanto houver pedido novo não visto (e ainda pendente).
  const pendingUnseen = orders.filter((o) => unseen.has(o.id) && o.status === 'pending')
  useEffect(() => {
    if (pendingUnseen.length > 0) {
      setAudioBlocked(isAudioBlocked())
      startAlarm()
      document.title = `(${pendingUnseen.length}) Novo pedido!`
    } else {
      stopAlarm()
      document.title = 'Pedidos'
    }
  }, [pendingUnseen.length])

  // Impressão: abre quando printOrder muda (manual ou automática).
  useEffect(() => {
    if (!printOrder) return
    const id = requestAnimationFrame(() => window.print())
    return () => cancelAnimationFrame(id)
  }, [printOrder])

  const openOrder = (order: Order) => {
    setSelectedOrder(order)
    setShippingFee(order.shipping_fee > 0 ? String(order.shipping_fee) : '')
    setPaymentMethod(order.payment_method || '')
    setEtaMinutes(order.eta_minutes || 35)
    setUnseen((prev) => {
      const next = new Set(prev)
      next.delete(order.id)
      return next
    })
  }

  // Aviso ao cliente (WhatsApp, se ligado, e push). Nunca trava o fluxo.
  const notifyCustomer = (order: Order, step: NotifiableStep) => {
    if (order.source !== 'online') return
    const message = STATUS_NOTIFICATION_MESSAGES[step]?.(order)
    if (whatsappNotificationsEnabled && message && order.customer_phone) {
      fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ establishment_id: order.establishment_id, phone: order.customer_phone, message }),
      }).catch((err) => logError('painel:pedidos', 'erro ao enviar notificação WhatsApp', err))
    }
    fetch('/api/push/send-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: order.id }),
    }).catch((err) => logError('painel:pedidos', 'erro ao enviar push do pedido', err))
  }

  const applyUpdated = (updated: Order) => {
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
    setSelectedOrder((prev) => (prev && prev.id === updated.id ? updated : prev))
  }

  // Todas as mudanças passam por funções do banco que mexem em pedido,
  // estoque e financeiro juntos (migration 045).
  const runAction = async (fn: () => Promise<{ data: unknown; error: { message: string } | null }>, successMessage: string, step: NotifiableStep | null) => {
    setSaving(true)
    try {
      const { data, error } = await fn()
      if (error) throw new Error(error.message)
      const updated = data as Order
      applyUpdated(updated)
      if (step) notifyCustomer(updated, step)
      toast.success(successMessage)
      return updated
    } catch (err: any) {
      const message = err?.message || 'Erro ao atualizar o pedido.'
      if (/já foi atualizado|não pode avançar/.test(message)) {
        toast(message)
        loadOrders()
      } else {
        toast.error(message)
        if (!/Pix automático|motivo/.test(message)) logCritical('painel:pedidos:acao', message, err, establishmentId)
      }
      return null
    } finally {
      setSaving(false)
    }
  }

  const acceptOrder = async (order: Order, quick = false) => {
    const nextStatus = trackingEnabled ? 'confirmed' : 'completed'
    const updated = await runAction(
      async () => supabase.rpc('accept_order', {
        p_order_id: order.id,
        p_new_status: nextStatus,
        p_shipping_fee: quick ? null : (shippingFee.trim() === '' ? null : Number(shippingFee.replace(',', '.'))),
        p_payment_method: quick ? null : paymentMethod || null,
        p_eta_minutes: trackingEnabled ? (quick ? 35 : etaMinutes) : null,
      }),
      trackingEnabled ? 'Pedido aceito' : 'Pedido concluído',
      nextStatus
    )
    if (updated) {
      setUnseen((prev) => {
        const next = new Set(prev)
        next.delete(order.id)
        return next
      })
      if (autoPrintEnabled && quick) setPrintOrder(updated)
    }
  }

  const advance = (order: Order, newStatus: 'preparing' | 'completed') =>
    runAction(
      async () => supabase.rpc('advance_order', { p_order_id: order.id, p_new_status: newStatus, p_dispatch: false }),
      newStatus === 'preparing' ? 'Em preparo' : 'Pedido concluído',
      newStatus
    )

  const dispatch = (order: Order) =>
    runAction(
      async () => supabase.rpc('advance_order', { p_order_id: order.id, p_new_status: null, p_dispatch: true }),
      order.order_type === 'pickup' ? 'Cliente avisado: pronto para retirar' : 'Cliente avisado: saiu para entrega',
      'dispatched'
    )

  const confirmCancel = async () => {
    if (!cancelPrompt || !cancelReason.trim()) return
    const order = orders.find((o) => o.id === cancelPrompt.orderId)
    if (order?.payment_method === 'mercadopago_pix' && order.payment_status === 'approved') {
      const ok = await confirmDialog({
        title: 'Este pedido já foi pago pelo Pix automático',
        message: 'Cancelar aqui não devolve o dinheiro. Faça o estorno pelo app do Mercado Pago.',
        confirmLabel: 'Cancelar mesmo assim',
        danger: true,
      })
      if (!ok) return
    }
    const { orderId } = cancelPrompt
    const reason = cancelReason.trim()
    setCancelPrompt(null)
    await runAction(async () => supabase.rpc('cancel_order', { p_order_id: orderId, p_reason: reason }), 'Pedido cancelado', null)
  }

  const changePaper = (width: PaperWidth) => {
    setPaperWidth(width)
    try {
      localStorage.setItem(PAPER_KEY, String(width))
    } catch {}
  }

  const filteredOrders = orders.filter((o) => {
    if (!search.trim()) return true
    const term = search.trim().toLowerCase()
    const digits = term.replace(/\D/g, '')
    return o.customer_name.toLowerCase().includes(term) || (digits && o.customer_phone.replace(/\D/g, '').includes(digits)) || o.id.startsWith(term)
  })
  const ordersByStatus = (status: Order['status']) => filteredOrders.filter((o) => o.status === status)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-primary-500" />
      </div>
    )
  }

  const tableLabel = (order: Order) => tableLabelByTabId.get(order.table_tab_id || '') || '?'
  const waCustomer = (order: Order, text = '') => `https://wa.me/${toWhatsAppNumber(order.customer_phone)}${text ? `?text=${encodeURIComponent(text)}` : ''}`

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Pedidos</h1>
          <p className="text-gray-600 mt-1">Aceite, acompanhe e avise o cliente em cada etapa.</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {establishmentId && <PushNotificationToggle establishmentId={establishmentId} />}
          {establishmentId && (
            <AutoPrintToggle
              establishmentId={establishmentId}
              autoPrintEnabled={autoPrintEnabled}
              printerLabel={printerLabel}
              onChange={({ autoPrintEnabled: next, printerLabel: nextLabel }) => {
                setAutoPrintEnabled(next)
                setPrinterLabel(nextLabel)
              }}
            />
          )}
          <select value={paperWidth} onChange={(e) => changePaper(Number(e.target.value) as PaperWidth)} className="input-field py-2 text-sm w-auto" aria-label="Largura do papel da impressora">
            <option value={80}>Papel 80 mm</option>
            <option value={58}>Papel 58 mm</option>
          </select>
          <div className="relative sm:w-64">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="search" placeholder="Nome, telefone ou nº" className="input-field pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Pedido novo: faixa que chama atenção enquanto alguém não abrir */}
      {pendingUnseen.length > 0 && (
        <div className="rounded-2xl bg-comanda text-ink p-4 flex flex-col sm:flex-row sm:items-center gap-3 shadow-md animate-ring">
          <BellRing size={26} className="flex-shrink-0" />
          <div className="flex-1">
            <p className="font-display text-lg font-extrabold">
              {pendingUnseen.length === 1 ? 'Novo pedido!' : `${pendingUnseen.length} pedidos novos!`}
            </p>
            <p className="text-sm">
              {pendingUnseen[0].customer_name} · {formatBRL(Number(pendingUnseen[0].total))}
              {pendingUnseen[0].payment_method === 'mercadopago_pix' && pendingUnseen[0].payment_status !== 'approved' ? ' · aguardando Pix' : ''}
            </p>
          </div>
          <div className="flex gap-2">
            {audioBlocked && (
              <button onClick={async () => { if (await unlockAudio()) setAudioBlocked(false) }} className="btn-secondary text-sm py-2 bg-white/70">
                <Volume2 size={16} /> Ativar som
              </button>
            )}
            <button onClick={() => openOrder(pendingUnseen[0])} className="bg-ink text-white font-semibold rounded-lg px-4 py-2 text-sm">Abrir pedido</button>
          </div>
        </div>
      )}

      {orderAutomationMode === 'automatic' && (
        cronLastRunAt && Date.now() - new Date(cronLastRunAt).getTime() <= 5 * 60 * 1000 ? (
          <div className="card bg-primary-50 border border-primary-100 flex items-center gap-2 py-3">
            <Bot size={18} className="text-primary-600 flex-shrink-0" />
            <p className="text-sm text-gray-700">
              <strong>Automação ligada:</strong> os pedidos avançam sozinhos nos tempos de <Link href="/painel/configuracoes" className="underline">Configurações</Link>. Você ainda pode agir manualmente.
            </p>
          </div>
        ) : (
          <div className="card bg-amber-50 border border-amber-200 flex items-center gap-2 py-3">
            <Bot size={18} className="text-amber-600 flex-shrink-0" />
            <p className="text-sm text-gray-700">
              <strong>A automação pode estar parada.</strong> {cronLastRunAt ? `Última execução às ${new Date(cronLastRunAt).toLocaleTimeString('pt-BR')}.` : 'Ainda não vimos nenhuma execução.'} Avance os pedidos manualmente se notar atraso.
            </p>
          </div>
        )
      )}

      {/* Kanban */}
      <div className="flex gap-4 overflow-x-auto pb-4 snap-x">
        {columns.map((column) => {
          const columnOrders = ordersByStatus(column.status)
          const style = columnStyles[column.color]
          return (
            <section key={column.status} className="min-w-[290px] w-[290px] flex-shrink-0 snap-start" aria-label={column.label}>
              <div className={`${style.bg} rounded-2xl p-3`}>
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <column.icon size={16} className={style.icon} />
                    <h3 className={`font-semibold ${style.title} text-sm`}>{column.label}</h3>
                  </div>
                  <span className={`${style.badge} text-xs font-bold px-2 py-0.5 rounded-full tabular-nums`}>{columnOrders.length}</span>
                </div>

                <div className="space-y-2.5 min-h-[160px]">
                  {columnOrders.map((order) => {
                    const age = minutesSince(order.status === 'pending' ? order.created_at : order.status_changed_at || order.created_at)
                    const late = order.status === 'pending' ? age >= 5 : order.eta_minutes && order.accepted_at ? minutesSince(order.accepted_at) > order.eta_minutes : false
                    const isNew = unseen.has(order.id)
                    return (
                      <div key={order.id} className={`bg-white rounded-xl border ${isNew ? 'border-amber-400 ring-2 ring-amber-200' : 'border-gray-100'} shadow-sm`}>
                        <button onClick={() => openOrder(order)} className="w-full text-left p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">{order.customer_name}</p>
                              <p className="text-xs text-gray-500 font-mono">#{order.id.slice(0, 6)} · {order.items.reduce((s, i) => s + i.quantity, 0)} item(ns)</p>
                            </div>
                            <span className={`text-xs font-semibold tabular-nums whitespace-nowrap ${late ? 'text-red-600' : 'text-gray-500'}`}>
                              {age < 1 ? 'agora' : `${age} min`}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap text-xs">
                            {order.source === 'mesa' && <span className="inline-flex items-center gap-1 text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded"><Table2 size={11} /> Mesa {tableLabel(order)}</span>}
                            {order.source === 'balcao' && <span className="text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">Balcão</span>}
                            {order.source === 'online' && (
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${order.order_type === 'pickup' ? 'text-purple-700 bg-purple-50' : 'text-teal-700 bg-teal-50'}`}>
                                {order.order_type === 'pickup' ? <Store size={11} /> : <Bike size={11} />}
                                {order.order_type === 'pickup' ? 'Retirada' : order.delivery_address?.neighborhood || 'Entrega'}
                              </span>
                            )}
                            {order.payment_method === 'mercadopago_pix' && (
                              order.payment_status === 'approved'
                                ? <span className="text-green-700 bg-green-50 px-1.5 py-0.5 rounded font-semibold">Pix pago</span>
                                : <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">Aguardando Pix</span>
                            )}
                            {order.dispatched_at && order.status !== 'completed' && (
                              <span className="text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded">{order.order_type === 'pickup' ? 'Pronto' : 'Saiu'}</span>
                            )}
                          </div>
                          <p className="text-sm font-bold text-gray-900 mt-2 tabular-nums">{formatBRL(Number(order.total))}</p>
                        </button>
                        {/* Ação principal sem abrir o pedido */}
                        {order.status === 'pending' && !(order.payment_method === 'mercadopago_pix' && order.payment_status !== 'approved') && (
                          <div className="px-3 pb-3">
                            <button onClick={() => acceptOrder(order, true)} disabled={saving} className="btn-primary w-full text-sm py-2">
                              {trackingEnabled ? 'Aceitar (35 min)' : 'Concluir'}
                            </button>
                          </div>
                        )}
                        {order.status === 'confirmed' && (
                          <div className="px-3 pb-3">
                            <button onClick={() => advance(order, 'preparing')} disabled={saving} className="btn-secondary w-full text-sm py-2">Iniciar preparo</button>
                          </div>
                        )}
                        {order.status === 'preparing' && (
                          <div className="px-3 pb-3">
                            {order.source === 'online' && !order.dispatched_at ? (
                              <button onClick={() => dispatch(order)} disabled={saving} className="btn-secondary w-full text-sm py-2">
                                {order.order_type === 'pickup' ? 'Pronto para retirar' : 'Saiu para entrega'}
                              </button>
                            ) : (
                              <button onClick={() => advance(order, 'completed')} disabled={saving} className="btn-secondary w-full text-sm py-2">Concluir</button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {columnOrders.length === 0 && <div className="text-center py-8 text-gray-400 text-sm">Nenhum pedido</div>}
                </div>
              </div>
            </section>
          )
        })}
      </div>

      {/* Detalhe do pedido */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="order-title">
          <div className="fixed inset-0 bg-black/50" onClick={() => setSelectedOrder(null)} />
          <div className="relative bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto animate-slide-up sm:animate-fade-in">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 z-10">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="order-title" className="font-display text-lg font-extrabold text-gray-900 truncate">{selectedOrder.customer_name}</h2>
                  <p className="text-sm text-gray-500 font-mono">#{selectedOrder.id.slice(0, 8)} · {new Date(selectedOrder.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => setPrintOrder({ ...selectedOrder })} className="btn-secondary text-sm py-2 px-3" title="Imprimir comanda"><Printer size={16} /></button>
                  <a href={rawbtPrintUrl(buildReceiptText(selectedOrder, { storeName: establishmentName, width: paperWidth, tableLabel: tableLabel(selectedOrder) }))} className="btn-secondary text-sm py-2 px-3 sm:hidden" title="Imprimir na térmica (app RawBT)">Térmica</a>
                </div>
              </div>
              {selectedOrder.customer_phone && (
                <div className="flex gap-2 mt-3">
                  <a href={waCustomer(selectedOrder)} target="_blank" rel="noopener noreferrer" className="btn-secondary text-sm py-1.5 px-3"><MessageCircle size={15} /> {selectedOrder.customer_phone}</a>
                  <a href={waCustomer(selectedOrder, `Oi, ${selectedOrder.customer_name.split(' ')[0]}! Sobre seu pedido #${selectedOrder.id.slice(0, 6)}: está atrasando cerca de 10 minutos. Desculpe a demora!`)} target="_blank" rel="noopener noreferrer" className="btn-secondary text-sm py-1.5 px-3">Avisar atraso</a>
                </div>
              )}
            </div>

            <div className="p-5 space-y-4">
              {selectedOrder.source === 'online' && (
                <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-xl text-sm">
                  {selectedOrder.order_type === 'pickup' ? (
                    <><Store size={16} className="text-purple-600 flex-shrink-0 mt-0.5" /><span className="font-medium text-gray-800">Retirada no local</span></>
                  ) : (
                    <>
                      <MapPin size={16} className="text-teal-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-gray-800">Entrega</p>
                        {selectedOrder.delivery_address && (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${selectedOrder.delivery_address.street}, ${selectedOrder.delivery_address.number} - ${selectedOrder.delivery_address.neighborhood}`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-700 hover:underline"
                          >
                            {selectedOrder.delivery_address.street}, {selectedOrder.delivery_address.number}
                            {selectedOrder.delivery_address.complement && ` - ${selectedOrder.delivery_address.complement}`} · {selectedOrder.delivery_address.neighborhood}
                            {selectedOrder.delivery_address.reference && <span className="block text-xs text-gray-500">Referência: {selectedOrder.delivery_address.reference}</span>}
                          </a>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
              {selectedOrder.source === 'mesa' && (
                <div className="flex items-center gap-2 p-3 bg-orange-50 rounded-xl text-sm font-medium text-orange-800"><Table2 size={16} /> Mesa {tableLabel(selectedOrder)}</div>
              )}

              <div className="space-y-2">
                {selectedOrder.items.map((item: OrderItem, index: number) => (
                  <div key={index} className="flex items-start justify-between gap-3 p-3 bg-gray-50 rounded-xl">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">{item.quantity}x {item.product_name}</p>
                      {item.variations?.map((v, i) => (
                        <p key={i} className="text-xs text-gray-600">{v.group_name}: {v.option_name}{v.price_delta > 0 ? ` (+${formatBRL(v.price_delta)})` : ''}</p>
                      ))}
                      {item.note && <p className="text-xs font-semibold text-amber-800 bg-amber-50 rounded px-1.5 py-0.5 mt-1 inline-block">Obs: {item.note}</p>}
                    </div>
                    <span className="font-medium text-gray-900 tabular-nums">{formatBRL(item.total_price)}</span>
                  </div>
                ))}
              </div>

              {selectedOrder.notes && (
                <div className="p-3 bg-amber-50 rounded-xl text-sm text-amber-900"><strong>Observações:</strong> {selectedOrder.notes}</div>
              )}

              <div className="border-t border-gray-100 pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-gray-600">Subtotal</span><span className="tabular-nums">{formatBRL(Number(selectedOrder.subtotal))}</span></div>
                {!!selectedOrder.discount && selectedOrder.discount > 0 && (
                  <div className="flex justify-between text-green-700"><span>Desconto {selectedOrder.coupon_code ? `(${selectedOrder.coupon_code})` : selectedOrder.discount_source === 'birthday' ? '(aniversário)' : selectedOrder.discount_source === 'loyalty' ? '(pontos)' : ''}</span><span className="tabular-nums">-{formatBRL(Number(selectedOrder.discount))}</span></div>
                )}
                {selectedOrder.order_type === 'delivery' && (
                  <div className="flex justify-between"><span className="text-gray-600">Entrega</span><span className="tabular-nums">{formatBRL(Number(selectedOrder.shipping_fee || 0))}</span></div>
                )}
                {selectedOrder.payment_method && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 flex items-center gap-1"><Wallet size={13} /> Pagamento</span>
                    <span>
                      {paymentMethodLabel(selectedOrder.payment_method)}
                      {selectedOrder.payment_method === 'dinheiro' && selectedOrder.change_for ? ` · troco p/ ${formatBRL(Number(selectedOrder.change_for))} (${formatBRL(Number(selectedOrder.change_for) - Number(selectedOrder.total))})` : ''}
                      {selectedOrder.payment_method === 'mercadopago_pix' && (selectedOrder.payment_status === 'approved' ? ' · pago' : ' · aguardando')}
                    </span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg pt-1"><span>Total</span><span className="tabular-nums">{formatBRL(Number(selectedOrder.total))}</span></div>
              </div>

              {selectedOrder.status === 'cancelled' && selectedOrder.cancellation_reason && (
                <div className="bg-red-50 rounded-xl p-3 text-sm text-red-800"><strong>Cancelado:</strong> {selectedOrder.cancellation_reason}</div>
              )}

              {selectedOrder.status === 'pending' && (
                <div className="border-t border-gray-100 pt-4 space-y-4">
                  {selectedOrder.payment_method === 'mercadopago_pix' && selectedOrder.payment_status !== 'approved' ? (
                    <p className="text-sm bg-amber-50 text-amber-900 rounded-xl p-3">Aguardando o cliente pagar o Pix. O pedido é aceito sozinho quando o pagamento cair.</p>
                  ) : (
                    <>
                      {trackingEnabled && (
                        <div>
                          <p className="text-sm font-medium text-gray-700 mb-2">Previsão para o cliente</p>
                          <div className="grid grid-cols-3 gap-2">
                            {ETA_CHOICES.map((m) => (
                              <button key={m} type="button" onClick={() => setEtaMinutes(m)} aria-pressed={etaMinutes === m} className={`py-2.5 rounded-xl border-2 text-sm font-semibold ${etaMinutes === m ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-700'}`}>
                                {m} min
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        {selectedOrder.order_type === 'delivery' && (
                          <div>
                            <label htmlFor="ship-fee" className="block text-xs text-gray-600 mb-1">Taxa de entrega</label>
                            <input id="ship-fee" inputMode="decimal" className="input-field text-sm" value={shippingFee} onChange={(e) => setShippingFee(e.target.value.replace(/[^\d,.]/g, ''))} placeholder="0,00" />
                          </div>
                        )}
                        <div>
                          <label htmlFor="pay-method" className="block text-xs text-gray-600 mb-1">Pagamento</label>
                          <select id="pay-method" className="input-field text-sm" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                            <option value="">Como o cliente indicou</option>
                            {PAYMENT_METHODS.filter((p) => p.value !== 'mercadopago_pix').map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                          </select>
                        </div>
                      </div>
                    </>
                  )}
                  <div className="flex gap-3">
                    <button onClick={() => { setCancelReason(''); setCancelPrompt({ orderId: selectedOrder.id, warning: 'O cliente verá o motivo na página do pedido.' }) }} className="btn-secondary flex-1 text-red-600" disabled={saving}>Recusar</button>
                    {!(selectedOrder.payment_method === 'mercadopago_pix' && selectedOrder.payment_status !== 'approved') && (
                      <button onClick={() => acceptOrder(selectedOrder)} className="btn-primary flex-[2]" disabled={saving}>
                        {saving ? <Loader2 size={18} className="animate-spin" /> : trackingEnabled ? `Aceitar · ${etaMinutes} min` : 'Concluir pedido'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {(selectedOrder.status === 'confirmed' || selectedOrder.status === 'preparing') && (
                <div className="border-t border-gray-100 pt-4 space-y-2">
                  {selectedOrder.source === 'online' && !selectedOrder.dispatched_at && (
                    <button onClick={() => dispatch(selectedOrder)} className="btn-primary w-full" disabled={saving}>
                      <Send size={16} /> {selectedOrder.order_type === 'pickup' ? 'Avisar: pronto para retirar' : 'Avisar: saiu para entrega'}
                    </button>
                  )}
                  <div className="flex gap-3">
                    <button onClick={() => { setCancelReason(''); setCancelPrompt({ orderId: selectedOrder.id, warning: 'O estoque baixado volta e o lançamento financeiro é removido.' }) }} className="btn-secondary flex-1 text-red-600" disabled={saving}>Cancelar</button>
                    {selectedOrder.status === 'confirmed' ? (
                      <button onClick={() => advance(selectedOrder, 'preparing')} className="btn-secondary flex-1" disabled={saving}>Iniciar preparo</button>
                    ) : null}
                    <button onClick={() => advance(selectedOrder, 'completed')} className="btn-secondary flex-1" disabled={saving}>Concluir</button>
                  </div>
                </div>
              )}

              {selectedOrder.status === 'completed' && (
                <div className="border-t border-gray-100 pt-4">
                  {selectedOrder.customer_rating && (
                    <p className="text-sm text-gray-700 mb-3">Avaliação do cliente: {'★'.repeat(selectedOrder.customer_rating)}{'☆'.repeat(5 - selectedOrder.customer_rating)}{selectedOrder.customer_review ? ` · "${selectedOrder.customer_review}"` : ''}</p>
                  )}
                  <button onClick={() => { setCancelReason(''); setCancelPrompt({ orderId: selectedOrder.id, warning: 'Estorna um pedido já concluído: o estoque volta e o lançamento financeiro é removido.' }) }} className="btn-secondary w-full text-red-600" disabled={saving}>
                    Cancelar / estornar pedido
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {cancelPrompt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="cancel-title">
          <div className="fixed inset-0 bg-black/50" onClick={() => setCancelPrompt(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 animate-fade-in">
            <h2 id="cancel-title" className="font-display text-lg font-extrabold text-gray-900 mb-1">Cancelar pedido</h2>
            <p className="text-sm text-gray-600 mb-4">{cancelPrompt.warning}</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {['Produto em falta', 'Fora da área de entrega', 'Loja fechando', 'Cliente pediu'].map((r) => (
                <button key={r} type="button" onClick={() => setCancelReason(r)} className="text-xs border border-gray-200 rounded-full px-2.5 py-1 hover:bg-gray-50">{r}</button>
              ))}
            </div>
            <label htmlFor="cancel-reason" className="block text-sm font-medium text-gray-700 mb-1">Motivo</label>
            <textarea id="cancel-reason" className="input-field" rows={3} autoFocus value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="O cliente vai ver esse motivo." />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setCancelPrompt(null)} className="btn-secondary flex-1" disabled={saving}>Voltar</button>
              <button onClick={confirmCancel} className="btn-danger flex-1" disabled={saving || !cancelReason.trim()}>Cancelar pedido</button>
            </div>
          </div>
        </div>
      )}

      {/* Comanda impressa (largura do papel escolhida acima) */}
      {printOrder && (
        <div className="print-area hidden print:block" style={{ width: paperWidth === 58 ? '48mm' : '72mm' }}>
          <pre style={{ fontFamily: 'Courier New, monospace', fontSize: paperWidth === 58 ? '10px' : '12px', whiteSpace: 'pre-wrap', margin: 0 }}>
            {buildReceiptText(printOrder, { storeName: establishmentName, width: paperWidth, tableLabel: tableLabel(printOrder) })}
          </pre>
        </div>
      )}
    </div>
  )
}
