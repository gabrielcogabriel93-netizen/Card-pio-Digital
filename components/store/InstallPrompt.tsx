'use client'

import { useEffect, useState } from 'react'
import { Smartphone, X } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = (storeId: string) => `cardapio:install-dismissed:${storeId}`

// Guarda o evento de instalação do Chrome/Android assim que ele aparece
// (só dispara uma vez por carregamento de página).
let deferredPrompt: BeforeInstallPromptEvent | null = null
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
  })
}

function isStandalone() {
  return (
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true)
  )
}

/**
 * Convite para colocar o cardápio DA LOJA na tela inicial, mostrado
 * depois do pedido (quando o cliente já viu valor). O app instalado abre
 * direto no cardápio, com o nome e o ícone da loja (manifest por loja).
 * No iPhone não existe botão de instalar: mostra o passo a passo.
 */
export function InstallPrompt({ storeId, storeName }: { storeId: string; storeName: string }) {
  const [visible, setVisible] = useState(false)
  const [isIos, setIsIos] = useState(false)

  useEffect(() => {
    if (isStandalone()) return
    try {
      if (localStorage.getItem(DISMISS_KEY(storeId))) return
    } catch {}
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    setIsIos(ios)
    if (ios || deferredPrompt) setVisible(true)
  }, [storeId])

  const dismiss = () => {
    setVisible(false)
    try {
      localStorage.setItem(DISMISS_KEY(storeId), '1')
    } catch {}
  }

  const install = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice.catch(() => null)
    deferredPrompt = null
    dismiss()
  }

  if (!visible) return null

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 flex gap-3 text-left">
      <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center flex-shrink-0">
        <Smartphone size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm">Pedir de novo em 1 toque</p>
        {isIos ? (
          <p className="text-xs text-gray-600 mt-0.5">
            Toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong> para ter o app da {storeName}.
          </p>
        ) : (
          <>
            <p className="text-xs text-gray-600 mt-0.5">Coloque o app da {storeName} na tela inicial do seu celular.</p>
            <button onClick={install} className="btn-primary text-xs py-1.5 px-3 mt-2">Adicionar à tela inicial</button>
          </>
        )}
      </div>
      <button onClick={dismiss} className="text-gray-400 hover:text-gray-600 self-start" aria-label="Agora não">
        <X size={16} />
      </button>
    </div>
  )
}
