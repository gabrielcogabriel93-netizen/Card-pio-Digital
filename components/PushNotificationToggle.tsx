'use client'

import { useState, useEffect } from 'react'
import { isPushSupported, subscribeToPush, unsubscribeFromPush, sendTestPush } from '@/lib/pushClient'
import { Bell, BellOff, BellRing, Loader2 } from 'lucide-react'

type Status = 'checking' | 'unsupported' | 'denied' | 'off' | 'on'

export function PushNotificationToggle({ establishmentId }: { establishmentId: string }) {
  const [status, setStatus] = useState<Status>('checking')
  const [busy, setBusy] = useState(false)
  const [testMessage, setTestMessage] = useState<string | null>(null)

  useEffect(() => {
    checkStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const checkStatus = async () => {
    if (!isPushSupported()) {
      setStatus('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setStatus('denied')
      return
    }
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      setStatus(subscription ? 'on' : 'off')
    } catch {
      setStatus('off')
    }
  }

  const handleToggle = async () => {
    setBusy(true)
    setTestMessage(null)
    if (status === 'on') {
      await unsubscribeFromPush()
      setStatus('off')
    } else {
      const result = await subscribeToPush(establishmentId)
      if (result.ok) {
        setStatus('on')
      } else {
        alert(result.error || 'Não foi possível ativar as notificações.')
        if (Notification.permission === 'denied') setStatus('denied')
      }
    }
    setBusy(false)
  }

  const handleTest = async () => {
    setBusy(true)
    setTestMessage(null)
    const result = await sendTestPush(establishmentId)
    setTestMessage(result.message)
    setBusy(false)
  }

  if (status === 'unsupported') return null // não mostra nada — não tem o que oferecer

  if (status === 'checking') {
    return <Loader2 size={16} className="animate-spin text-gray-400" />
  }

  if (status === 'denied') {
    return (
      <span className="text-xs text-gray-400 flex items-center gap-1" title="Permissão de notificação bloqueada no navegador">
        <BellOff size={14} />
        Notificações bloqueadas
      </span>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleToggle}
        disabled={busy}
        className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors ${
          status === 'on' ? 'bg-primary-50 text-primary-700 hover:bg-primary-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
        title={status === 'on' ? 'Desativar notificações de novo pedido' : 'Ativar notificações de novo pedido'}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : status === 'on' ? <BellRing size={14} /> : <Bell size={14} />}
        {status === 'on' ? 'Notificações ativas' : 'Ativar notificações'}
      </button>
      {status === 'on' && (
        <button onClick={handleTest} disabled={busy} className="text-xs text-gray-400 hover:text-gray-600 underline">
          Testar
        </button>
      )}
      {testMessage && <span className="text-xs text-gray-500">{testMessage}</span>}
    </div>
  )
}
