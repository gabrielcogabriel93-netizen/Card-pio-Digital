'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { logCritical } from '@/lib/logger'
import { AlertTriangle, RotateCcw } from 'lucide-react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    logCritical('error-boundary:root', error.message, error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle size={28} className="text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Algo deu errado</h1>
        <p className="text-gray-600 mb-6">
          Encontramos um problema inesperado. Isso já foi registrado — tente novamente ou volte para o início.
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/" className="btn-secondary">
            Ir para o início
          </Link>
          <button onClick={reset} className="btn-primary">
            <RotateCcw size={18} />
            Tentar novamente
          </button>
        </div>
      </div>
    </div>
  )
}
