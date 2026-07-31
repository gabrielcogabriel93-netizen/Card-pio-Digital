'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { logError } from '@/lib/logger'
import { Loader2 } from 'lucide-react'

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

  return <div className="min-h-screen bg-gray-50">{children}</div>
}
