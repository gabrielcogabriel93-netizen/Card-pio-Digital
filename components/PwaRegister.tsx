'use client'

import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

export default function PwaRegister() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let refreshing = false
    // Evita reload em loop: só recarrega uma vez quando o novo SW assume.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    })

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // Já existe um SW esperando (ex: aba ficou aberta durante um
        // deploy) — mostra o aviso na hora, sem precisar de novo evento.
        if (registration.waiting && registration.active) {
          setWaitingWorker(registration.waiting)
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (!newWorker) return
          newWorker.addEventListener('statechange', () => {
            // 'installed' com um controller já ativo = atualização de
            // verdade (não a primeira instalação do SW nesse navegador).
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setWaitingWorker(newWorker)
            }
          })
        })

        // Força checar se há versão nova ao voltar pra aba — cobre quem
        // deixa o painel aberto em segundo plano por horas.
        const onVisible = () => {
          if (document.visibilityState === 'visible') registration.update().catch(() => {})
        }
        document.addEventListener('visibilitychange', onVisible)
      })
      .catch((err) => {
        console.error('Falha ao registrar service worker:', err)
      })
  }, [])

  if (!waitingWorker) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] bg-gray-900 text-white rounded-lg shadow-lg px-4 py-3 flex items-center gap-3 text-sm max-w-[calc(100vw-2rem)]">
      <RefreshCw size={16} className="shrink-0 text-primary-400" />
      <span>Nova versão disponível.</span>
      <button
        onClick={() => waitingWorker.postMessage({ type: 'SKIP_WAITING' })}
        className="bg-primary-500 hover:bg-primary-600 text-white font-medium px-3 py-1 rounded shrink-0"
      >
        Atualizar
      </button>
    </div>
  )
}
