'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { logError } from '@/lib/logger'
import { Loader2, ArrowLeft } from 'lucide-react'

// Gate de UX (a segurança de verdade está em cada rota /api/admin/**,
// que revalida o e-mail por conta própria via getPlatformAdminUser).
// Não fica dentro de /painel porque a autorização aqui é outra: não é
// "dono de um estabelecimento", é "dono da plataforma".
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const check = async () => {
      try {
        const response = await fetch('/api/admin/check')
        if (!response.ok) {
          router.push('/painel')
          return
        }
        setChecking(false)
      } catch (err) {
        logError('admin:layout', 'erro ao checar acesso de admin', err)
        router.push('/painel')
      }
    }
    check()
  }, [router])

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={32} className="animate-spin text-primary-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sem isso, /admin (e suas subrotas) era um beco sem saída: o
          layout não tem sidebar (autorização é de dono-da-plataforma,
          não de dono-de-estabelecimento, ver comentário acima), e
          nenhuma página aqui dentro linkava de volta pro /painel. */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <Link href="/painel" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
            <ArrowLeft size={16} />
            Voltar ao painel
          </Link>
        </div>
      </div>
      {children}
    </div>
  )
}
