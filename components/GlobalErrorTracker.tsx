'use client'

import { useEffect } from 'react'
import { logCritical } from '@/lib/logger'

// error.tsx (error boundary) só pega erro de RENDER. Erro dentro de um
// handler de evento, callback assíncrono, ou promise sem `.catch` nunca
// passa por um error boundary — some no console do usuário sem ninguém
// mais ficar sabendo. Esses dois listeners globais são a rede de segurança
// pra esses casos (mesmo destino: tabela error_logs, ver lib/logger.ts).
export default function GlobalErrorTracker() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      logCritical('window:error', event.message || 'Erro não tratado', event.error || event.message)
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      const message = reason instanceof Error ? reason.message : String(reason)
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
