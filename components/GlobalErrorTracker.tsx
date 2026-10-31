'use client'

import { useEffect } from 'react'
import { logCritical } from '@/lib/logger'
import { isThirdPartyNoise } from '@/lib/thirdPartyErrors'

// error.tsx (error boundary) só pega erro de RENDER. Erro dentro de um
// handler de evento, callback assíncrono, ou promise sem `.catch` nunca
// passa por um error boundary — some no console do usuário sem ninguém
// mais ficar sabendo. Esses dois listeners globais são a rede de segurança
// pra esses casos (mesmo destino: tabela error_logs, ver lib/logger.ts).
export default function GlobalErrorTracker() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      // Script injetado pelo Instagram/Facebook, extensão etc.: não é do app.
      if (isThirdPartyNoise({ message: event.message, stack: event.error?.stack, filename: event.filename })) return
      logCritical('window:error', event.message || 'Erro não tratado', event.error || event.message)
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      const message = reason instanceof Error ? reason.message : String(reason)
      if (isThirdPartyNoise({ message, stack: reason instanceof Error ? reason.stack : null })) return
      logCritical('window:unhandledrejection', message || 'Promise rejeitada sem tratamento', reason)
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)

    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  }, [])

  return null
}
