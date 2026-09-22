'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { log, logError } from '@/lib/logger'
import { toWhatsAppNumber } from '@/lib/phone'
import { MessageCircle, Loader2, Construction, Cake, Send, ShoppingCart, UserX } from 'lucide-react'

// Conexão de WhatsApp (sessão via whatsapp-server) ainda não está pronta
// pra oferecer em produção — fica com o botão de conectar desativado e
// um aviso claro, em vez de parecer funcional e falhar na cara do
// lojista. As notificações automáticas de status continuam desligadas
// por depender dessa conexão (o toggle abaixo já reflete isso).
const WHATSAPP_CONNECTION_IMPLEMENTED = false

interface CustomerRow {
  id: string
  name: string
  phone: string
  birth_date: string | null
}

interface InactiveCustomerRow {
  id: string
  name: string
  phone: string
  last_order_at: string
}

interface CartDraftRow {
  id: string
  customer_phone: string
  customer_name: string | null
  cart_snapshot: { name: string; quantity: number; unit_price: number }[]
  cart_total: number
  updated_at: string
}

export default function WhatsappPage() {
  const [establishmentId, setEstablishmentId] = useState('')
  const [establishmentName, setEstablishmentName] = useState('')
  const [establishmentSlug, setEstablishmentSlug] = useState('')
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [birthdaysToday, setBirthdaysToday] = useState<CustomerRow[]>([])
  const [sendingTo, setSendingTo] = useState<string | null>(null)
  const [abandonedCarts, setAbandonedCarts] = useState<CartDraftRow[]>([])
  const [inactiveCustomers, setInactiveCustomers] = useState<InactiveCustomerRow[]>([])

  useEffect(() => {
    loadEstablishment()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadEstablishment = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: est, error } = await supabase
        .from('establishments')
        .select('id, name, slug, whatsapp_notifications_enabled, abandoned_cart_minutes, inactive_customer_days')
        .eq('owner_id', user.id)
        .single()

      if (error) logError('painel:whatsapp', 'erro ao buscar estabelecimento', error)
      if (!est) return

      setEstablishmentId(est.id)
      setEstablishmentName(est.name)
      setEstablishmentSlug(est.slug)
      setNotificationsEnabled(est.whatsapp_notifications_enabled ?? false)

      await Promise.all([
        loadBirthdays(est.id),
        loadAbandonedCarts(est.id, est.abandoned_cart_minutes ?? 15),
        loadInactiveCustomers(est.id, est.inactive_customer_days ?? 20),
      ])
    } catch (err) {
      logError('painel:whatsapp', 'exceção ao carregar página', err)
    } finally {
      setLoading(false)
    }
  }

  const loadAbandonedCarts = async (id: string, minutes: number) => {
    const supabase = createClient()
    const threshold = new Date(Date.now() - minutes * 60_000).toISOString()
    const { data, error } = await supabase
      .from('cart_drafts')
      .select('id, customer_phone, customer_name, cart_snapshot, cart_total, updated_at')
      .eq('establishment_id', id)
      .is('recovered_at', null)
      .lt('updated_at', threshold)
      .order('updated_at', { ascending: false })

    if (error) {
      logError('painel:whatsapp', 'erro ao buscar carrinhos abandonados', error)
      return
    }
    setAbandonedCarts((data || []) as CartDraftRow[])
  }

  const loadInactiveCustomers = async (id: string, days: number) => {
    const supabase = createClient()
    const threshold = new Date(Date.now() - days * 24 * 60 * 60_000).toISOString()
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, phone, last_order_at')
      .eq('establishment_id', id)
      .not('last_order_at', 'is', null)
      .lt('last_order_at', threshold)
      .order('last_order_at', { ascending: true })
      .limit(50)

    if (error) {
      logError('painel:whatsapp', 'erro ao buscar clientes inativos', error)
      return
    }
    setInactiveCustomers((data || []) as InactiveCustomerRow[])
  }

  const loadBirthdays = async (id: string) => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, phone, birth_date')
      .eq('establishment_id', id)
      .not('birth_date', 'is', null)

    if (error) {
      logError('painel:whatsapp', 'erro ao buscar aniversariantes', error)
      return
    }

    const today = new Date()
    const todayMonthDay = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const matches = (data || []).filter((c: CustomerRow) => c.birth_date && c.birth_date.slice(5, 10) === todayMonthDay)
    setBirthdaysToday(matches)
  }

  const toggleNotifications = async () => {
    const next = !notificationsEnabled
    setNotificationsEnabled(next)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('establishments').update({ whatsapp_notifications_enabled: next }).eq('id', establishmentId)
      if (error) throw error
    } catch (err: any) {
      logError('painel:whatsapp', 'erro ao alternar notificações', err)
      setNotificationsEnabled(!next)
      alert('Erro ao alterar: ' + err.message)
    }
  }

  const handleSendBirthday = async (customer: CustomerRow) => {
    setSendingTo(customer.id)
    try {
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          establishment_id: establishmentId,
          phone: customer.phone,
          message: `🎉 Feliz aniversário, ${customer.name.split(' ')[0]}! A equipe da ${establishmentName} deseja um dia muito especial pra você! 🎂`,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      log('painel:whatsapp', 'mensagem de aniversário enviada', { customer: customer.id })
      alert(`Mensagem enviada para ${customer.name}!`)
    } catch (err: any) {
      logError('painel:whatsapp', 'erro ao enviar mensagem de aniversário', err)
      alert('Erro ao enviar: ' + err.message)
    } finally {
      setSendingTo(null)
    }
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

  const menuUrl = typeof window !== 'undefined' ? `${window.location.origin}/loja/${establishmentSlug}` : ''

  const abandonedCartWhatsAppUrl = (cart: CartDraftRow) => {
    let message = `Oi${cart.customer_name ? ` ${cart.customer_name.split(' ')[0]}` : ''}! 👋 Vi que você montou um pedido aqui na ${establishmentName} mas não chegou a confirmar. Ainda dá tempo!\n\n`
    cart.cart_snapshot.forEach((item) => {
      message += `${item.quantity}x ${item.name}\n`
    })
    message += `\n💰 Total: ${formatCurrency(cart.cart_total)}\n\n`
    message += `Finalize por aqui: ${menuUrl}`
    return `https://wa.me/${toWhatsAppNumber(cart.customer_phone)}?text=${encodeURIComponent(message)}`
  }

  const inactiveCustomerWhatsAppUrl = (customer: InactiveCustomerRow) => {
    const message = `Oi ${customer.name.split(' ')[0]}! 👋 Faz um tempinho que você não aparece por aqui na ${establishmentName}. Dá uma olhada nas novidades do nosso cardápio: ${menuUrl}`
    return `https://wa.me/${toWhatsAppNumber(customer.phone)}?text=${encodeURIComponent(message)}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-primary-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="page-title">WhatsApp</h1>
        <p className="text-gray-600 mt-1">Conecte o WhatsApp da loja pra notificar clientes sobre o status do pedido.</p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
        <Construction size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <p className="font-medium mb-1">Em implementação</p>
          <p>
            A conexão direta com o WhatsApp ainda está sendo preparada e não está disponível por
            enquanto. Enquanto isso, use as notificações push (Painel &gt; Pedidos) e o link do WhatsApp
            que já abre automaticamente pro cliente confirmar o pedido.
          </p>
        </div>
      </div>

      {/* Connection card */}
      <div className="card text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <MessageCircle size={28} className="text-gray-400" />
        </div>
        <p className="font-medium text-gray-900 mb-1">WhatsApp não conectado</p>
        <p className="text-sm text-gray-500 mb-4">Essa função ainda não está disponível.</p>
        <button disabled className="btn-primary opacity-50 cursor-not-allowed">
          <MessageCircle size={16} />
          Conectar WhatsApp (em breve)
        </button>
      </div>

      {/* Toggle */}
      <div className="card flex items-center justify-between">
        <div>
          <p className="font-medium text-gray-900">Notificações automáticas de status</p>
          <p className="text-sm text-gray-500">
            Avisa o cliente pelo WhatsApp quando o pedido for confirmado, entrar em preparo, sair para
            entrega ou ficar pronto pra retirada. Depende da conexão acima, ainda em implementação.
          </p>
        </div>
        <button
          type="button"
          onClick={toggleNotifications}
          disabled={!WHATSAPP_CONNECTION_IMPLEMENTED}
          className={`relative w-14 h-7 rounded-full flex-shrink-0 ml-4 transition-colors disabled:opacity-40 ${
            notificationsEnabled ? 'bg-primary-500' : 'bg-gray-300'
          }`}
        >
          <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${notificationsEnabled ? 'translate-x-7' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* Mensagens prontas: aniversário */}
      <div className="card">
        <div className="flex items-center gap-2 mb-1">
          <Cake size={18} className="text-primary-500" />
          <h2 className="text-lg font-semibold text-gray-900">Aniversariantes de hoje</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Mensagem pronta — você só clica em enviar, cliente por cliente. Também depende da conexão
          acima.
        </p>
        {birthdaysToday.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Nenhum cliente com perfil salvo faz aniversário hoje.</p>
        ) : (
          <div className="space-y-2">
            {birthdaysToday.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm font-medium text-gray-900">{c.name}</span>
                <button
                  onClick={() => handleSendBirthday(c)}
                  disabled={!WHATSAPP_CONNECTION_IMPLEMENTED || sendingTo === c.id}
                  className="btn-primary text-sm py-1.5 px-3"
                >
                  {sendingTo === c.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Enviar parabéns
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Carrinhos abandonados (migration 042) */}
      <div className="card">
        <div className="flex items-center gap-2 mb-1">
          <ShoppingCart size={18} className="text-primary-500" />
          <h2 className="text-lg font-semibold text-gray-900">Carrinhos abandonados</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Clientes que chegaram a informar o telefone mas não confirmaram o pedido. Isso NÃO manda
          mensagem sozinho — o link abre o WhatsApp com o texto pronto, você quem envia.
        </p>
        {abandonedCarts.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Nenhum carrinho abandonado no momento.</p>
        ) : (
          <div className="space-y-2">
            {abandonedCarts.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.customer_name || c.customer_phone}</p>
                  <p className="text-xs text-gray-500">{c.cart_snapshot.length} item(ns) · {formatCurrency(c.cart_total)}</p>
                </div>
                <a
                  href={abandonedCartWhatsAppUrl(c)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary text-sm py-1.5 px-3 flex-shrink-0"
                >
                  <Send size={14} />
                  Chamar
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Clientes inativos (migration 043) */}
      <div className="card">
        <div className="flex items-center gap-2 mb-1">
          <UserX size={18} className="text-primary-500" />
          <h2 className="text-lg font-semibold text-gray-900">Clientes inativos</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Já pediram antes, mas não pedem há um tempo (configurável em Configurações). Mesmo aviso: o
          link abre o WhatsApp pronto, você quem envia.
        </p>
        {inactiveCustomers.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Nenhum cliente inativo no momento.</p>
        ) : (
          <div className="space-y-2">
            {inactiveCustomers.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                  <p className="text-xs text-gray-500">
                    Último pedido: {new Date(c.last_order_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <a
                  href={inactiveCustomerWhatsAppUrl(c)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary text-sm py-1.5 px-3 flex-shrink-0"
                >
                  <Send size={14} />
                  Chamar de volta
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
