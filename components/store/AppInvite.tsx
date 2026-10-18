'use client'

import { useEffect, useState } from 'react'
import { SmartImage } from '@/components/SmartImage'
import { toast } from '@/components/Feedback'
import {
  devicePlatform, enableStoreNotifications, isStandaloneApp, storeNotifyState, type StoreNotifyState,
} from '@/lib/pushClient'
import { Bell, BellRing, Download, Loader2, Share, SquarePlus, X } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// O Chrome/Android avisa uma vez por carregamento que dá para instalar:
// guarda o evento para usar quando o cliente tocar no botão.
let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    listeners.forEach((fn) => fn())
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    listeners.forEach((fn) => fn())
  })
}

/** Dá para instalar com um toque (Android/computador)? */
export function useInstallPrompt() {
  const [canInstall, setCanInstall] = useState(false)
  useEffect(() => {
    const update = () => setCanInstall(!!deferredPrompt && !isStandaloneApp())
    update()
    listeners.add(update)
    return () => {
      listeners.delete(update)
    }
  }, [])
  const install = async () => {
    if (!deferredPrompt) return false
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice.catch(() => null)
    deferredPrompt = null
    listeners.forEach((fn) => fn())
    return choice?.outcome === 'accepted'
  }
  return { canInstall, install }
}

const DISMISS_KEY = (storeId: string) => `fregues:convite-app:${storeId}`

/**
 * Convite para ter o app DA LOJA (com o logo e o nome dela) e ligar os
 * avisos de pedido e ofertas. É o canal da loja com o cliente: substitui
 * o WhatsApp. No iPhone o aviso só funciona com o app na tela inicial.
 */
export function AppInvite({
  storeId,
  storeName,
  logoUrl,
  orderId,
  customer,
  dismissible = false,
}: {
  storeId: string
  storeName: string
  logoUrl?: string | null
  orderId?: string | null
  customer?: { phone?: string | null; token?: string | null; name?: string | null }
  dismissible?: boolean
}) {
  const { canInstall, install } = useInstallPrompt()
  const [state, setState] = useState<StoreNotifyState | null>(null)
  const [installed, setInstalled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    setState(storeNotifyState(storeId))
    setInstalled(isStandaloneApp())
    if (dismissible) {
      try {
        if (localStorage.getItem(DISMISS_KEY(storeId))) setHidden(true)
      } catch {}
    }
  }, [storeId, dismissible])

  if (!state || hidden || state === 'unsupported' && !canInstall) return null
  if (state === 'on' && (installed || !canInstall)) {
    return dismissible ? null : (
      <p className="flex items-center justify-center gap-1.5 text-sm text-green-700 bg-green-50 rounded-xl py-2.5 px-3">
        <BellRing size={16} /> Avisos ativos: você recebe o status do pedido aqui.
      </p>
    )
  }

  const activate = async () => {
    setBusy(true)
    const result = await enableStoreNotifications(storeId, customer || {}, orderId)
    setBusy(false)
    if (result.ok) {
      setState('on')
      toast.success(`Pronto! A ${storeName} vai te avisar por aqui.`)
    } else {
      toast(result.error || 'Não foi possível ativar os avisos.')
      setState(storeNotifyState(storeId))
    }
  }

  const doInstall = async () => {
    const ok = await install()
    if (ok) toast.success(`App da ${storeName} instalado! Abra pelo ícone na sua tela.`)
  }

  const dismiss = () => {
    setHidden(true)
    try {
      localStorage.setItem(DISMISS_KEY(storeId), '1')
    } catch {}
  }

  const iosSteps = state === 'ios-install-first'

  return (
    <div className="relative rounded-2xl border border-primary-100 bg-primary-50/60 p-4 text-left">
      {dismissible && (
        <button onClick={dismiss} className="absolute right-3 top-3 text-gray-400 hover:text-gray-600" aria-label="Agora não">
          <X size={16} />
        </button>
      )}
      <div className="flex items-center gap-3 pr-5">
        <div className="relative w-12 h-12 rounded-2xl overflow-hidden bg-white shadow-sm flex-shrink-0 flex items-center justify-center">
          {logoUrl ? (
            <SmartImage src={logoUrl} alt={storeName} fill sizes="48px" className="object-cover" />
          ) : (
            <span className="font-display text-xl font-extrabold text-primary-600">{storeName.charAt(0)}</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 leading-tight">
            {installed ? `Avisos da ${storeName}` : `App da ${storeName}`}
          </p>
          <p className="text-xs text-gray-600 mt-0.5">Status do pedido na hora, ofertas e pedir de novo em 1 toque.</p>
        </div>
      </div>

      {iosSteps ? (
        <ol className="mt-3 space-y-1.5 text-sm text-gray-800">
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-white text-xs font-bold flex items-center justify-center">1</span>
            Toque em <Share size={15} className="text-primary-600" aria-label="Compartilhar" /> <strong>Compartilhar</strong>
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-white text-xs font-bold flex items-center justify-center">2</span>
            <SquarePlus size={15} className="text-primary-600" aria-hidden="true" /> <strong>Adicionar à Tela de Início</strong>
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-white text-xs font-bold flex items-center justify-center">3</span>
            Abra pelo ícone e ative os avisos
          </li>
          <li className="text-xs text-gray-500 pt-1">No iPhone, os avisos do pedido só chegam pelo app instalado.</li>
        </ol>
      ) : (
        <div className="mt-3 grid gap-2">
          {canInstall && !installed && (
            <button onClick={doInstall} className="btn-primary w-full py-2.5 text-sm">
              <Download size={16} /> Instalar o app
            </button>
          )}
          {state === 'off' && (
            <button onClick={activate} disabled={busy} className={`${canInstall && !installed ? 'btn-secondary' : 'btn-primary'} w-full py-2.5 text-sm`}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />} Ativar avisos do pedido
            </button>
          )}
          {state === 'denied' && (
            <p className="text-xs text-gray-600">
              Os avisos estão bloqueados. Libere nas configurações do navegador{devicePlatform() === 'android' ? ' (cadeado ao lado do endereço → Notificações)' : ''}.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
