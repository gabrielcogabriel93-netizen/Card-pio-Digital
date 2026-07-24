'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { log, logError } from '@/lib/logger'
import { MessageCircle, Loader2, QrCode, CheckCircle2, LogOut, AlertTriangle, Cake, Send } from 'lucide-react'

type SessionStatus = 'disconnected' | 'starting' | 'qrcode' | 'connected'

interface CustomerRow {
  id: string
  name: string
  phone: string
  birth_date: string | null
}

export default function WhatsappPage() {
  const [establishmentId, setEstablishmentId] = useState('')
  const [establishmentName, setEstablishmentName] = useState('')
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('disconnected')
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [birthdaysToday, setBirthdaysToday] = useState<CustomerRow[]>([])
  const [sendingTo, setSendingTo] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    loadEstablishment()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadEstablishment = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: est, error } = await supabase
        .from('establishments')
        .select('id, name, whatsapp_notifications_enabled')
        .eq('owner_id', user.id)
        .single()

      if (error) logError('painel:whatsapp', 'erro ao buscar estabelecimento', error)
      if (!est) return

      setEstablishmentId(est.id)
      setEstablishmentName(est.name)
      setNotificationsEnabled(est.whatsapp_notifications_enabled ?? false)

      await refreshStatus(est.id)
      await loadBirthdays(est.id)
    } catch (err) {
      logError('painel:whatsapp', 'exceção ao carregar página', err)
    } finally {
      setLoading(false)
    }
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

  const refreshStatus = async (id: string) => {
    try {
      const response = await fetch(`/api/whatsapp/status?establishment_id=${id}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setSessionStatus(data.status)
      setQrCode(data.qrCode)
      setServerError(null)
      return data.status as SessionStatus
    } catch (err: any) {
      setServerError(err.message || 'Servidor WhatsApp indisponível.')
      return 'disconnected'
    }
  }

  const startPolling = (id: string) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      const status = await refreshStatus(id)
      if (status === 'connected' || status === 'disconnected') {
        if (pollRef.current) clearInterval(pollRef.current)
      }
    }, 3000)
  }

  const handleConnect = async () => {
    if (!establishmentId) return
    setConnecting(true)
    setServerError(null)
    try {
      const response = await fetch('/api/whatsapp/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ establishment_id: establishmentId }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setSessionStatus(data.status)
      setQrCode(data.qrCode)
      startPolling(establishmentId)
    } catch (err: any) {
      logError('painel:whatsapp', 'erro ao conectar', err)
      setServerError(err.message || 'Não foi possível conectar. Confira se o servidor WhatsApp está rodando.')
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!establishmentId || !confirm('Desconectar o WhatsApp desta loja?')) return
    try {
      await fetch('/api/whatsapp/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ establishment_id: establishmentId }),
      })
      setSessionStatus('disconnected')
      setQrCode(null)
    } catch (err) {
      logError('painel:whatsapp', 'erro ao desconectar', err)
    }
  }

  const toggleNotifications = async () => {
    const next = !notificationsEnabled
    setNotificationsEnabled(next)
    try {
      const supabase = createClient()
      await supabase.from('establishments').update({ whatsapp_notifications_enabled: next }).eq('id', establishmentId)
    } catch (err) {
      logError('painel:whatsapp', 'erro ao alternar notificações', err)
      setNotificationsEnabled(!next)
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
        <h1 className="text-2xl font-bold text-gray-900">WhatsApp</h1>
        <p className="text-gray-600 mt-1">Conecte o WhatsApp da loja pra notificar clientes sobre o status do pedido.</p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
        <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <p className="font-medium mb-1">Leia antes de conectar</p>
          <p>
            Isso usa automação não-oficial do WhatsApp — existe risco (baixo, mas real) do número ser
            bloqueado. Só são enviadas mensagens 1 para 1, quando você muda o status de um pedido ou
            clica pra mandar parabéns — nunca envio em massa automático.
          </p>
        </div>
      </div>

      {/* Connection card */}
      <div className="card text-center">
        {sessionStatus === 'connected' ? (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 size={28} className="text-green-600" />
            </div>
            <p className="font-medium text-gray-900 mb-1">WhatsApp conectado</p>
            <p className="text-sm text-gray-500 mb-4">Pronto para enviar notificações.</p>
            <button onClick={handleDisconnect} className="btn-secondary">
              <LogOut size={16} />
              Desconectar
            </button>
          </>
        ) : sessionStatus === 'qrcode' && qrCode ? (
          <>
            <p className="font-medium text-gray-900 mb-3">Escaneie com o WhatsApp do celular da loja</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrCode} alt="QR Code WhatsApp" className="mx-auto rounded-lg border border-gray-200" width={220} height={220} />
            <p className="text-xs text-gray-500 mt-3">WhatsApp → Aparelhos conectados → Conectar um aparelho</p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <QrCode size={28} className="text-gray-400" />
            </div>
            <p className="font-medium text-gray-900 mb-1">WhatsApp não conectado</p>
            <p className="text-sm text-gray-500 mb-4">Conecte pra ativar as notificações automáticas.</p>
            <button onClick={handleConnect} disabled={connecting} className="btn-primary">
              {connecting ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />}
              Conectar WhatsApp
            </button>
          </>
        )}
        {serverError && <p className="text-xs text-red-500 mt-3">{serverError}</p>}
      </div>

      {/* Toggle */}
      <div className="card flex items-center justify-between">
        <div>
          <p className="font-medium text-gray-900">Notificações automáticas de status</p>
          <p className="text-sm text-gray-500">
            Avisa o cliente pelo WhatsApp quando o pedido for confirmado, entrar em preparo, sair para
            entrega ou ficar pronto pra retirada.
          </p>
        </div>
        <button
          type="button"
          onClick={toggleNotifications}
          disabled={sessionStatus !== 'connected'}
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
        <p className="text-sm text-gray-500 mb-4">Mensagem pronta — você só clica em enviar, cliente por cliente.</p>
        {birthdaysToday.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Nenhum cliente com perfil salvo faz aniversário hoje.</p>
        ) : (
          <div className="space-y-2">
            {birthdaysToday.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm font-medium text-gray-900">{c.name}</span>
                <button
                  onClick={() => handleSendBirthday(c)}
                  disabled={sessionStatus !== 'connected' || sendingTo === c.id}
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
    </div>
  )
}
