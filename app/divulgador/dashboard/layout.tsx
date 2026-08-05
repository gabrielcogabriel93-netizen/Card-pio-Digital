'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { logError } from '@/lib/logger'
import { Loader2, LogOut } from 'lucide-react'

// Gate de UX (mesmo espírito de app/admin/layout.tsx): quem garante a
// segurança de verdade é cada rota /api/divulgador/** revalidando a
// sessão por conta própria. Aqui só decide pra onde mandar o usuário:
// sem sessão -> /divulgador/login; sessão mas sem perfil ainda (ex: caso
// de confirmação de e-mail) -> /divulgador/completar-cadastro.
export default function DivulgadorDashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const check = async () => {
      try {
        const response = await fetch('/api/divulgador/check')
        if (response.status === 401) {
          router.push('/divulgador/login')
          return
        }
        const data = await response.json()
        if (!data.hasProfile) {
          router.push('/divulgador/completar-cadastro')
          return
        }
        setChecking(false)
      } catch (err) {
        logError('divulgador:dashboard:layout', 'erro ao checar acesso', err)
        router.push('/divulgador/login')
      }
    }
    check()
  }, [router])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/divulgador/login')
    router.refresh()
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={32} className="animate-spin text-primary-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/divulgador/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">C</span>
            </div>
            <span className="font-bold text-gray-900">
              Catalog<span className="text-primary-500">AI</span> <span className="text-gray-400 font-normal">· divulgador</span>
            </span>
          </Link>
          <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1.5">
            <LogOut size={16} />
            Sair
          </button>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
