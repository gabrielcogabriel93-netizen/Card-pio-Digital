import { Loader2 } from 'lucide-react'
import { Logo } from '@/components/Logo'

/**
 * Fallback automático do Next.js (loading.tsx por segmento de rota) —
 * aparece instantaneamente durante a navegação, antes mesmo da página de
 * destino carregar seus próprios dados. Sem isso, conexão lenta = tela
 * branca sem nenhuma pista de que algo está acontecendo.
 */
export function PageLoading({ label = 'Carregando...' }: { label?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <Logo size={40} className="text-primary-300" />
          <Loader2 size={64} className="animate-spin text-primary-500 absolute -inset-3" strokeWidth={1.5} />
        </div>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  )
}
