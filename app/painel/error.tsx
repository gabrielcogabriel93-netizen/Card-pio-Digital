'use client'

import { useEffect } from 'react'
import { logCritical } from '@/lib/logger'
import { AlertTriangle, RotateCcw } from 'lucide-react'

export default function PainelError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    logCritical('error-boundary:painel', error.message, error)
  }, [error])

  return (
    <div className="flex items-center justify-center py-24 px-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle size={28} className="text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Esta tela travou</h1>
        <p className="text-gray-600 mb-6">
          Encontramos um problema ao carregar esta página. Já registramos o erro — tente novamente.
        </p>
        <button onClick={reset} className="btn-primary">
          <RotateCcw size={18} />
          Tentar novamente
        </button>
      </div>
    </div>
  )
}
