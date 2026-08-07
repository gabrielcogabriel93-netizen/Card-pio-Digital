'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { log, logError, logCritical } from '@/lib/logger'
import { playNotificationSound } from '@/lib/sound'
import { useEscapeKey } from '@/lib/useEscapeKey'
import { PushNotificationToggle } from '@/components/PushNotificationToggle'
import { AutoPrintToggle } from '@/components/AutoPrintToggle'
import { PAYMENT_METHODS, paymentMethodLabel } from '@/lib/paymentMethods'
import { STATUS_NOTIFICATION_MESSAGES } from '@/lib/orderStatusMessages'
import type { Order, OrderItem, OrderAutomationMode } from '@/types'
import { Loader2, Clock, CheckCircle, ChefHat, XCircle, ArrowRight, DollarSign, ExternalLink, Search, Printer, Bike, Store, MapPin, Wallet, Bot } from 'lucide-react'

// Limite de segurança: sem paginação de verdade ainda, mas evita puxar um
// histórico infinito conforme a loja acumula pedidos.
const MAX_ORDERS = 200

// Separador em texto (em vez de <hr>) — visual mais "cupom matricial" na
// impressão, já que a fonte vira monoespaçada só ali (ver globals.css).
const PRINT_DASH_LINE = '-'.repeat(42)

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
  const [search, setSearch] = useState('')
  // Lojas sem preparo (produto pronto) desligam isso em Configurações —
  // aí o Kanban some com as colunas "Confirmado"/"Em Preparo" e o pedido
  // pula direto de Pendente para Concluído num clique só.
  const [trackingEnabled, setTrackingEnabled] = useState(true)
  const [establishmentId, setEstablishmentId] = useState('')
  const [whatsappNotificationsEnabled, setWhatsappNotificationsEnabled] = useState(false)

  // Impressão automática — separado de `selectedOrder` de propósito: um
  // pedido novo chegando não pode trocar o que está aberto no modal caso
  // o lojista esteja olhando outro pedido no momento.
  const [printOrder, setPrintOrder] = useState<Order | null>(null)
  const [autoPrintEnabled, setAutoPrintEnabled] = useState<boolean | null>(null)
  const [printerLabel, setPrinterLabel] = useState('')
  const [firstOrderPrompt, setFirstOrderPrompt] = useState<Order | null>(null)
  const [firstOrderPrinterDraft, setFirstOrderPrinterDraft] = useState('')
  const [orderAutomationMode, setOrderAutomationMode] = useState<OrderAutomationMode>('manual')
  const [cronLastRunAt, setCronLastRunAt] = useState<string | null>(null)
  // Motivo do cancelamento agora é obrigatório — em vez do confirm() nativo
  // de antes, abre esse pedido de motivo (texto livre) antes de cancelar
  // de verdade. `warning` carrega o aviso específico de cada caso (pedido
  // pendente/em andamento/já concluído), igual ao confirm() que existia.
  const [cancelPrompt, setCancelPrompt] = useState<{ orderId: string; warning: string } | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  // A subscrição realtime é criada uma única vez (useEffect com deps
  // vazias) — sem essa ref, o callback ficaria preso no valor de
  // autoPrintEnabled do momento em que a aba abriu (stale closure).
  const autoPrintEnabledRef = useRef<boolean | null>(null)
  useEffect(() => {
    autoPrintEnabledRef.current = autoPrintEnabled
  }, [autoPrintEnabled])

  const allColumns: { status: Order['status']; label: string; icon: any; color: keyof typeof columnStyles }[] = [
    { status: 'pending', label: 'Pendente', icon: Clock, color: 'yellow' },
    { status: 'confirmed', label: 'Confirmado', icon: CheckCircle, color: 'blue' },
    { status: 'preparing', label: 'Em Preparo', icon: ChefHat, color: 'purple' },
    { status: 'completed', label: 'Concluído', icon: CheckCircle, color: 'green' },
    { status: 'cancelled', label: 'Cancelado', icon: XCircle, color: 'red' },
  ]

  const columns = trackingEnabled
    ? allColumns
    : allColumns.filter((c) => c.status === 'pending' || c.status === 'completed' || c.status === 'cancelled')

  useEscapeKey(() => setShowModal(false), showModal)
  useEscapeKey(() => setCancelPrompt(null), !!cancelPrompt)

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
          if (payload.eventType === 'INSERT') {
            playNotificationSound()
            const newOrder = payload.new as Order
            if (autoPrintEnabledRef.current === true) {
              setPrintOrder({ ...newOrder })
            } else if (autoPrintEnabledRef.current === null) {
              setFirstOrderPrompt(newOrder)
            }
          }
          loadOrders()
        }
      )
      .subscribe((status) => {
        log('painel:pedidos', 'status da inscrição realtime', { status })
      })

    // Rede de segurança: em celular, a conexão de tempo real pode cair
    // silenciosamente quando o app vai para segundo plano. Esse refetch
    // periódico garante que o Kanban não fique desatualizado por muito
    // tempo mesmo se isso acontecer.
    const interval = setInterval(() => {
      log('painel:pedidos', 'refetch periódico (rede de segurança do realtime)')
      loadOrders()
    }, 30000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [])

  // Dispara a impressão sempre que `printOrder` muda — tanto pelo clique
  // manual no botão "Imprimir" quanto pela impressão automática de pedido
  // novo. O requestAnimationFrame dá tempo do React desenhar o
  // .print-area com os dados desse pedido antes do window.print() rodar.
  useEffect(() => {
    if (!printOrder) return
    const id = requestAnimationFrame(() => window.print())
    return () => cancelAnimationFrame(id)
  }, [printOrder])

  const loadOrders = async () => {
    log('painel:pedidos', 'carregando pedidos...')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: est, error: estError } = await supabase
        .from('establishments')
        .select('id, order_tracking_enabled, whatsapp_notifications_enabled, auto_print_enabled, printer_label, order_automation_mode')
        .eq('owner_id', user.id)
        .single()

      if (estError) logError('painel:pedidos', 'erro ao buscar estabelecimento', estError)
      if (!est) return

      setTrackingEnabled(est.order_tracking_enabled ?? true)
      setEstablishmentId(est.id)
      setWhatsappNotificationsEnabled(est.whatsapp_notifications_enabled ?? false)
      setAutoPrintEnabled(est.auto_print_enabled ?? null)
      setPrinterLabel(est.printer_label || '')
      setOrderAutomationMode(est.order_automation_mode || 'manual')

      if ((est.order_automation_mode || 'manual') === 'automatic') {
        const { data: health } = await supabase
          .from('cron_health')
          .select('last_run_at')
          .eq('job_name', 'advance-automatic-orders')
          .maybeSingle()
        setCronLastRunAt(health?.last_run_at ?? null)
      }

      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('establishment_id', est.id)
        .order('created_at', { ascending: false })
        .limit(MAX_ORDERS)

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

  const handleUpdateStatus = async (orderId: string, newStatus: Order['status'], cancellationReason?: string) => {
    setSaving(true)
    log('painel:pedidos', 'atualizando status do pedido', { orderId, newStatus, statusNaTela: selectedOrder?.status })
    try {
      const supabase = createClient()

      // Nunca confia no status que já estava carregado na tela — o
      // pedido pode ter avançado sozinho (webhook do Mercado Pago,
      // automação por tempo) enquanto esse modal estava aberto. Lê o
      // estado atual do banco antes de decidir qualquer coisa.
      const { data: currentOrder, error: currentOrderError } = await supabase
        .from('orders')
        .select('status, payment_method, payment_status')
        .eq('id', orderId)
        .single()
      if (currentOrderError || !currentOrder) throw currentOrderError || new Error('Pedido não encontrado')

      const currentStatus = currentOrder.status as Order['status']
      const wasStockAlreadyDeducted = currentStatus !== 'pending' && currentStatus !== 'cancelled'

      // Lojas com acompanhamento desligado pulam direto de Pendente para
      // Concluído (sem passar por Confirmado/Em Preparo) — mas ainda
      // precisam do mesmo lançamento financeiro e baixa de estoque que
      // normalmente aconteceriam na confirmação.
      const isFirstAcceptance = newStatus === 'confirmed' ||
        (newStatus === 'completed' && currentStatus === 'pending')

      // Nunca libera pra cozinha um Pix automático que ainda não foi
      // pago — só a confirmação de pagamento de verdade (webhook do
      // Mercado Pago) pode tirar esse pedido de "pendente".
      if (isFirstAcceptance && currentOrder.payment_method === 'mercadopago_pix' && currentOrder.payment_status !== 'approved') {
        alert('Esse pedido ainda não teve o pagamento confirmado pelo Mercado Pago. Aguarde a confirmação automática antes de aceitar.')
        return
      }

      // Cancelar um pedido já pago via Pix automático não estorna o
      // cliente sozinho — isso só acontece de verdade no painel do
      // Mercado Pago.
      if (newStatus === 'cancelled' && currentOrder.payment_method === 'mercadopago_pix' && currentOrder.payment_status === 'approved') {
        if (!confirm('Esse pedido já foi pago via Pix automático. Cancelar aqui NÃO estorna o cliente — você precisa reembolsar manualmente pelo painel do Mercado Pago. Quer continuar mesmo assim?')) {
          return
        }
      }

      const updateData: any = { status: newStatus }
      if (newStatus === 'cancelled') {
        updateData.cancellation_reason = cancellationReason?.trim() || null
      }
      if (isFirstAcceptance) {
        // O frete só é definido na confirmação — o total precisa ser
        // recalculado aqui, senão a entrada financeira e o pedido ficam
        // subestimados pelo valor do frete (e o desconto do cupom, se
        // houver, precisa continuar sendo descontado).
        const finalShippingFee = parseFloat(shippingFee) || 0
        const finalTotal = (selectedOrder?.subtotal || 0) - (selectedOrder?.discount || 0) + finalShippingFee
        updateData.payment_method = paymentMethod
        updateData.shipping_fee = finalShippingFee
        updateData.total = finalTotal
      }

      // Trava de idempotência: só grava se o status no banco ainda for o
      // que acabamos de ler — se o webhook do Mercado Pago ou a
      // automação por tempo mudou isso nesse meio tempo, essa atualização
      // não "pega" e evita lançar financeiro/baixar estoque em dobro.
      const { data: updatedOrder, error: updateError } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', orderId)
        .eq('status', currentStatus)
        .select()
        .maybeSingle()
      if (updateError) throw updateError

      if (!updatedOrder) {
        alert('Esse pedido acabou de ser atualizado em outro lugar (talvez pelo pagamento automático) — recarregando com os dados mais recentes.')
        setShowModal(false)
        setSelectedOrder(null)
        await loadOrders()
        return
      }

      if (isFirstAcceptance) {
        log('painel:pedidos', 'criando entrada financeira da confirmação', { finalTotal: updateData.total })
        const { error: financeError } = await supabase.from('financial_entries').insert({
          establishment_id: updatedOrder.establishment_id,
          order_id: orderId,
          type: 'income',
          amount: updateData.total,
          description: `Pedido #${orderId.slice(0, 8)} - ${updatedOrder.customer_name}`,
        })
        if (financeError) throw financeError

        log('painel:pedidos', 'baixando estoque dos itens do pedido')
        await adjustStockForItems(updatedOrder.items || [], 'decrement')
      }

      // Cancelamento após a baixa de estoque já ter ocorrido (inclusive
      // pedidos já concluídos): estorna o estoque e remove a entrada
      // financeira lançada na confirmação.
      if (newStatus === 'cancelled' && wasStockAlreadyDeducted) {
        log('painel:pedidos', 'estornando estoque e removendo entrada financeira (cancelamento)')
        await adjustStockForItems(updatedOrder.items || [], 'increment')
        const { error: deleteFinanceError } = await supabase
          .from('financial_entries')
          .delete()
          .eq('order_id', orderId)
        if (deleteFinanceError) throw deleteFinanceError
      }

      // Notificação 1 pra 1 pro cliente via WhatsApp — nunca trava o fluxo
      // de atualização do pedido; se o servidor WhatsApp estiver fora do
      // ar, o lojista continua trabalhando normalmente no Kanban.
      const notificationMessage = STATUS_NOTIFICATION_MESSAGES[newStatus]?.(updatedOrder)
      if (whatsappNotificationsEnabled && updatedOrder.source === 'online' && notificationMessage && updatedOrder.customer_phone) {
        fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            establishment_id: updatedOrder.establishment_id,
            phone: updatedOrder.customer_phone,
            message: notificationMessage,
          }),
        }).catch((err) => logError('painel:pedidos', 'erro ao enviar notificação WhatsApp', err))
      }

      // Notificação push pro cliente, se ele tiver ativado em
      // /pedido/[id] — mesmo espírito do WhatsApp acima, nunca trava o
      // fluxo. A rota deriva a mensagem sozinha a partir do status atual.
      if (updatedOrder.source === 'online') {
        fetch('/api/push/send-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_id: orderId }),
        }).catch((err) => logError('painel:pedidos', 'erro ao enviar notificação push do pedido', err))
      }

      log('painel:pedidos', 'status do pedido atualizado com sucesso')
      setShowModal(false)
      setSelectedOrder(null)
      await loadOrders()
    } catch (error: any) {
      logError('painel:pedidos', 'erro ao atualizar status do pedido', error)
      logCritical('painel:pedidos:atualizar-status', error.message, error, selectedOrder?.establishment_id)
      alert('Erro ao atualizar pedido: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const openCancelPrompt = (orderId: string, warning: string) => {
    setCancelReason('')
    setCancelPrompt({ orderId, warning })
  }

  const handleConfirmCancel = async () => {
    if (!cancelPrompt || !cancelReason.trim()) return
    const { orderId } = cancelPrompt
    setCancelPrompt(null)
    await handleUpdateStatus(orderId, 'cancelled', cancelReason.trim())
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

  const handleEnableAutoPrintFromPrompt = async () => {
    const orderToPrint = firstOrderPrompt
    setFirstOrderPrompt(null)
    const label = firstOrderPrinterDraft.trim()
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('establishments')
        .update({ auto_print_enabled: true, printer_label: label || null })
        .eq('id', establishmentId)
      if (error) throw error
      setAutoPrintEnabled(true)
      setPrinterLabel(label)
      if (orderToPrint) setPrintOrder({ ...orderToPrint })
    } catch (error) {
      logError('painel:pedidos', 'erro ao ativar impressão automática', error)
      alert('Erro ao ativar a impressão automática.')
    }
  }

  const handleDismissFirstOrderPrompt = async () => {
    setFirstOrderPrompt(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('establishments').update({ auto_print_enabled: false }).eq('id', establishmentId)
      if (error) throw error
      setAutoPrintEnabled(false)
    } catch (error) {
      logError('painel:pedidos', 'erro ao registrar recusa de impressão automática', error)
    }
  }

  const filteredOrders = orders.filter((o) => {
    if (!search.trim()) return true
    const term = search.trim().toLowerCase()
    return (
      o.customer_name.toLowerCase().includes(term) ||
      o.customer_phone.replace(/\D/g, '').includes(term.replace(/\D/g, ''))
    )
  })

  const getOrdersByStatus = (status: Order['status']) => {
    return filteredOrders.filter((o) => o.status === status)
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Pedidos</h1>
          <p className="text-gray-600 mt-1">Gerencie os pedidos dos seus clientes.</p>
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
          <div className="relative sm:w-72">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome ou telefone..."
              className="input-field pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {orderAutomationMode === 'automatic' && (
        cronLastRunAt && Date.now() - new Date(cronLastRunAt).getTime() <= 5 * 60 * 1000 ? (
          <div className="card bg-primary-50 border border-primary-100 flex items-center gap-2 py-3">
            <Bot size={18} className="text-primary-600 flex-shrink-0" />
            <p className="text-sm text-gray-700">
              <strong>Automação ligada</strong> — os pedidos avançam sozinhos pelos status, nos tempos
              configurados em <Link href="/painel/configuracoes" className="underline">Configurações</Link>.
              Você ainda pode mudar o status manualmente ou cancelar a qualquer momento.
            </p>
          </div>
        ) : (
          <div className="card bg-amber-50 border border-amber-200 flex items-center gap-2 py-3">
            <Bot size={18} className="text-amber-600 flex-shrink-0" />
            <p className="text-sm text-gray-700">
              <strong>Automação ligada, mas pode estar parada</strong> — {cronLastRunAt
                ? `a última execução foi há mais de 5 minutos (${new Date(cronLastRunAt).toLocaleTimeString('pt-BR')}).`
                : 'ainda não vimos nenhuma execução dela.'}{' '}
              Fique de olho e avance os pedidos manualmente se notar atraso.
            </p>
          </div>
        )
      )}

      {firstOrderPrompt && (
        <div className="card bg-primary-50 border border-primary-100 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="flex items-start gap-2">
            <Printer size={18} className="text-primary-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-gray-900">
                Chegou um pedido novo — quer que a comanda saia impressa sozinha da próxima vez?
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Só funciona com esta aba aberta no computador ligado à impressora. Dá pra mudar isso
                quando quiser, ali em cima.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <input
              type="text"
              value={firstOrderPrinterDraft}
              onChange={(e) => setFirstOrderPrinterDraft(e.target.value)}
              placeholder="Apelido da impressora (opcional)"
              className="input-field text-sm py-1.5 w-48"
            />
            <button onClick={handleEnableAutoPrintFromPrompt} className="btn-primary text-sm py-1.5 px-3 whitespace-nowrap">
              Ativar
            </button>
            <button onClick={handleDismissFirstOrderPrompt} className="btn-secondary text-sm py-1.5 px-3 whitespace-nowrap">
              Agora não
            </button>
          </div>
        </div>
      )}

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
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {order.source === 'balcao' && (
                          <span className="text-xs text-blue-500 inline-block">Balcão</span>
                        )}
                        {order.source === 'online' && (
                          <span className={`text-xs inline-flex items-center gap-1 ${order.order_type === 'pickup' ? 'text-purple-500' : 'text-teal-600'}`}>
                            {order.order_type === 'pickup' ? <Store size={11} /> : <Bike size={11} />}
                            {order.order_type === 'pickup' ? 'Retirada' : 'Entrega'}
                          </span>
                        )}
                        {order.payment_method && (
                          <span className="text-xs inline-flex items-center gap-1 text-gray-500">
                            <Wallet size={11} />
                            {paymentMethodLabel(order.payment_method)}
                          </span>
                        )}
                        {order.payment_method === 'mercadopago_pix' && (
                          order.payment_status === 'approved' ? (
                            <span className="text-xs inline-flex items-center gap-1 text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                              ✅ Pago
                            </span>
                          ) : (
                            <span className="text-xs inline-flex items-center gap-1 text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                              ⏳ Aguardando pagamento
                            </span>
                          )
                        )}
                      </div>
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
                <button
                  onClick={() => setPrintOrder({ ...selectedOrder })}
                  className="btn-secondary text-sm"
                  title="Imprimir comanda"
                >
                  <Printer size={16} />
                  Imprimir
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Entrega/Retirada */}
              {selectedOrder.source === 'online' && (
                <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg text-sm">
                  {selectedOrder.order_type === 'pickup' ? (
                    <>
                      <Store size={16} className="text-purple-500 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-700 font-medium">Retirada no local</span>
                    </>
                  ) : (
                    <>
                      <MapPin size={16} className="text-teal-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-gray-700 font-medium">Entrega</p>
                        {selectedOrder.delivery_address && (
                          <p className="text-gray-600">
                            {selectedOrder.delivery_address.street}, {selectedOrder.delivery_address.number}
                            {selectedOrder.delivery_address.complement && ` - ${selectedOrder.delivery_address.complement}`}
                            {' — '}{selectedOrder.delivery_address.neighborhood}
                            {selectedOrder.delivery_address.zip_code && ` (CEP ${selectedOrder.delivery_address.zip_code})`}
                            {selectedOrder.delivery_address.reference && (
                              <span className="block text-xs text-gray-500">Referência: {selectedOrder.delivery_address.reference}</span>
                            )}
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

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
                {!!selectedOrder.discount && selectedOrder.discount > 0 && (
                  <div className="flex justify-between text-sm text-primary-600">
                    <span>Desconto {selectedOrder.coupon_code ? `(${selectedOrder.coupon_code})` : ''}</span>
                    <span>-{formatCurrency(selectedOrder.discount)}</span>
                  </div>
                )}
                {(selectedOrder.status === 'confirmed' || selectedOrder.status !== 'pending') && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Frete</span>
                    <span>{formatCurrency(selectedOrder.shipping_fee || 0)}</span>
                  </div>
                )}
                {selectedOrder.payment_method && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Pagamento</span>
                    <span className="flex items-center gap-1.5">
                      {paymentMethodLabel(selectedOrder.payment_method)}
                      {selectedOrder.payment_method === 'mercadopago_pix' && (
                        selectedOrder.payment_status === 'approved' ? (
                          <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">✅ Pago</span>
                        ) : (
                          <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">⏳ Aguardando</span>
                        )
                      )}
                    </span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg border-t border-gray-200 pt-2">
                  <span>Total</span>
                  <span className="text-primary-600">{formatCurrency(selectedOrder.total)}</span>
                </div>
              </div>

              {selectedOrder.status === 'cancelled' && selectedOrder.cancellation_reason && (
                <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-sm">
                  <p className="font-medium text-red-700 flex items-center gap-1.5"><XCircle size={14} /> Motivo do cancelamento</p>
                  <p className="text-red-600 mt-1">{selectedOrder.cancellation_reason}</p>
                </div>
              )}

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
                        {PAYMENT_METHODS.filter((p) => p.value !== 'mercadopago_pix').map((p) => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                      {selectedOrder.payment_method && (
                        <p className="text-xs text-gray-500 mt-1">
                          Cliente indicou: {paymentMethodLabel(selectedOrder.payment_method)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => openCancelPrompt(selectedOrder.id, 'Cancelar este pedido?')}
                      className="btn-danger flex-1"
                      disabled={saving}
                    >
                      {saving ? <Loader2 size={18} className="animate-spin" /> : 'Cancelar Pedido'}
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(selectedOrder.id, trackingEnabled ? 'confirmed' : 'completed')}
                      className="btn-primary flex-1"
                      disabled={saving}
                    >
                      {saving ? <Loader2 size={18} className="animate-spin" /> : trackingEnabled ? 'Confirmar Pedido' : 'Concluir Pedido'}
                    </button>
                  </div>
                </div>
              )}

              {/* Status change for confirmed/preparing */}
              {(selectedOrder.status === 'confirmed' || selectedOrder.status === 'preparing') && (
                <div className="border-t border-gray-200 pt-4 flex gap-3">
                  <button
                    onClick={() => openCancelPrompt(selectedOrder.id, 'Cancelar este pedido? O estoque baixado será estornado.')}
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

              {/* Estornar um pedido já concluído (inclusive balcão) — antes
                  não existia jeito nenhum de reverter isso pela tela. */}
              {selectedOrder.status === 'completed' && (
                <div className="border-t border-gray-200 pt-4">
                  <button
                    onClick={() => openCancelPrompt(selectedOrder.id, 'Cancelar/estornar este pedido já concluído? O estoque baixado será devolvido e o lançamento financeiro removido.')}
                    className="btn-danger w-full"
                    disabled={saving}
                  >
                    {saving ? <Loader2 size={18} className="animate-spin" /> : 'Cancelar / Estornar Pedido'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Motivo do cancelamento — obrigatório, aparece por cima do modal de
          detalhe do pedido. Sem motivo preenchido não dá pra confirmar; é
          esse texto que o cliente vê depois na página de acompanhamento. */}
      {cancelPrompt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setCancelPrompt(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6 animate-fade-in">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Cancelar pedido</h2>
            <p className="text-sm text-gray-600 mb-4">{cancelPrompt.warning}</p>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Motivo do cancelamento
            </label>
            <textarea
              className="input-field"
              rows={3}
              autoFocus
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ex: produto em falta, loja fechou mais cedo, endereço fora da área de entrega..."
            />
            <p className="text-xs text-gray-500 mt-1">O cliente vai ver esse motivo na página de acompanhamento do pedido.</p>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setCancelPrompt(null)} className="btn-secondary flex-1" disabled={saving}>
                Voltar
              </button>
              <button
                onClick={handleConfirmCancel}
                className="btn-danger flex-1"
                disabled={saving || !cancelReason.trim()}
              >
                {saving ? <Loader2 size={18} className="animate-spin" /> : 'Confirmar cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comanda para impressão — via botão manual (setPrintOrder) ou
          sozinha em pedido novo, se a impressão automática estiver
          ligada (ver useEffect de printOrder acima). Nunca usa
          selectedOrder aqui, de propósito: senão um pedido novo chegando
          trocaria o que está aberto no modal de detalhe na tela. */}
      {printOrder && (
        <div className="print-area hidden print:block p-6">
          <h2 className="text-lg font-bold mb-1">Pedido #{printOrder.id.slice(0, 8)}</h2>
          <p className="text-sm mb-1">Cliente: {printOrder.customer_name}</p>
          <p className="text-sm mb-1">Telefone: {printOrder.customer_phone}</p>
          {printOrder.source === 'online' && (
            <p className="text-sm mb-1">
              {printOrder.order_type === 'pickup' ? 'Retirada no local' : 'Entrega'}
              {printOrder.order_type === 'delivery' && printOrder.delivery_address && (
                <>
                  {' — '}{printOrder.delivery_address.street}, {printOrder.delivery_address.number}
                  {printOrder.delivery_address.complement && ` - ${printOrder.delivery_address.complement}`}
                  {' — '}{printOrder.delivery_address.neighborhood}
                </>
              )}
            </p>
          )}
          <p className="text-sm mb-4">
            {new Date(printOrder.created_at).toLocaleString('pt-BR')}
          </p>
          <div className="my-2">{PRINT_DASH_LINE}</div>
          {printOrder.items.map((item: OrderItem, index: number) => (
            <div key={index} className="mb-2 text-sm">
              <div className="flex justify-between font-medium">
                <span>{item.quantity}x {item.product_name}</span>
                <span>{formatCurrency(item.total_price)}</span>
              </div>
              {item.variations?.map((v, i) => (
                <p key={i} className="text-xs pl-4">{v.group_name}: {v.option_name}</p>
              ))}
            </div>
          ))}
          <div className="my-2">{PRINT_DASH_LINE}</div>
          <div className="flex justify-between text-sm">
            <span>Subtotal</span>
            <span>{formatCurrency(printOrder.subtotal)}</span>
          </div>
          {!!printOrder.discount && printOrder.discount > 0 && (
            <div className="flex justify-between text-sm">
              <span>Desconto {printOrder.coupon_code ? `(${printOrder.coupon_code})` : ''}</span>
              <span>-{formatCurrency(printOrder.discount)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span>Frete</span>
            <span>{formatCurrency(printOrder.shipping_fee || 0)}</span>
          </div>
          <div className="flex justify-between font-bold text-base mt-1">
            <span>Total</span>
            <span>{formatCurrency(printOrder.total)}</span>
          </div>
          {printOrder.payment_method && (
            <p className="text-sm mt-1">Pagamento: {paymentMethodLabel(printOrder.payment_method)}</p>
          )}
          {printOrder.notes && (
            <p className="text-sm mt-3">Obs: {printOrder.notes}</p>
          )}
        </div>
      )}
    </div>
  )
}
