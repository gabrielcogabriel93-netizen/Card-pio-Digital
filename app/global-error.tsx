'use client'

import { useEffect } from 'react'
import { logCritical, logWarning } from '@/lib/logger'
import { isChunkLoadError, reloadOnceForChunkError } from '@/lib/chunkReload'

// Última rede de segurança: erro no próprio layout raiz (onde app/error.tsx
// não alcança). Registra na aba Logs do admin e mostra uma tela simples.
export default function RootGlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (isChunkLoadError(error)) {
      if (reloadOnceForChunkError()) return
      logWarning('error-boundary:versao-antiga', error.message, error)
      return
    }
    logCritical('error-boundary:global', error.message || 'Erro no layout raiz', { message: error.message, stack: error.stack, digest: error.digest })
  }, [error])

  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#F6F7FB', color: '#14172B', display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', margin: 0, padding: 16 }}>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Algo deu errado</h1>
          <p style={{ color: '#4A4F6A', marginBottom: 20 }}>O problema já foi registrado. Tente de novo em instantes.</p>
          <button onClick={reset} style={{ background: '#2340E0', color: '#fff', border: 0, borderRadius: 10, padding: '10px 18px', fontWeight: 600, cursor: 'pointer' }}>
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  )
}
