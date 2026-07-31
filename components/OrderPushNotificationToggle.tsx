'use client'

import { useState, useEffect } from 'react'
import { isPushSupported, subscribeToOrderPush, unsubscribeFromOrderPush, hasLocalOrderPushSubscription } from '@/lib/pushClient'
import { Bell, BellOff, BellRing, Loader2 } from 'lucide-react'

type Status = 'checking' | 'unsupported' | 'denied' | 'off' | 'on'

// Ativa/desativa notificação push pra ESSE pedido (não pra loja inteira —
// ver lib/pushClient.ts). "Ligado" aqui reflete o localStorage, não uma
// consulta no banco (a tabela order_push_subscriptions não tem SELECT
// público de propósito) — é só a preferência lembrada nesse navegador.
export function OrderPushNotificationToggle({ orderId }: { orderId: string }) {
  const [status, setStatus] = useState<Status>('checking')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isPushSupported()) {
      setStatus('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setStatus('denied')
      return
    }
    setStatus(hasLocalOrderPushSubscription(orderId) ? 'on' : 'off')
  }, [orderId])

  const handleToggle = async () => {
    setBusy(true)
    if (status === 'on') {
      await unsubscribeFromOrderPush(orderId)
      setStatus('off')
    } else {
      const result = await subscribeToOrderPush(orderId)
      if (result.ok) {
        setStatus('on')
      } else {
        alert(result.error || 'Não foi possível ativar as notificações.')
        if (Notification.permission === 'denied') setStatus('denied')
      }
    }
    setBusy(false)
  }

  if (status === 'unsupported' || status === 'checking') return null

  if (status === 'denied') {
    return (
      <div className="card mb-4 flex items-center justify-center gap-1.5 text-xs text-gray-400 py-3" title="Permissão de notificação bloqueada no navegador">
        <BellOff size={13} />
        Notificações bloqueadas no navegador
      </div>
    )
  }

  return (
    <button
      onClick={handleToggle}
      disabled={busy}
      className={`card mb-4 w-full flex items-center justify-center gap-1.5 text-sm py-3 transition-colors ${
        status === 'on' ? 'text-primary-700' : 'text-gray-600 hover:text-gray-900'
      }`}
    >
      {busy ? <Loader2 size={16} className="animate-spin" /> : status === 'on' ? <BellRing size={16} /> : <Bell size={16} />}
      {status === 'on' ? 'Notificações ativas — avisamos quando o status mudar' : 'Avisar quando o status do pedido mudar'}
    </button>
  )
}
