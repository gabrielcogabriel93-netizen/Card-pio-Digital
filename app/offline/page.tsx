import Link from 'next/link'
import { WifiOff } from 'lucide-react'

// Fallback servido pelo service worker (public/sw.js) quando a navegação
// falha por falta de rede de verdade — precisa ser 100% estático (sem
// chamada a Supabase/API) porque é exatamente o cenário em que nada disso
// funciona. Pré-cacheado na instalação do SW para existir mesmo offline.
export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <WifiOff size={28} className="text-gray-400" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Sem conexão</h1>
        <p className="text-gray-600 mb-6">
          Não foi possível carregar essa página porque o dispositivo está sem internet no momento.
          Assim que a conexão voltar, tente de novo.
        </p>
        <Link href="/" className="btn-primary">
          Tentar novamente
        </Link>
      </div>
    </div>
  )
}
