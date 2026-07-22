'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { log, logError } from '@/lib/logger'
import {
  LayoutDashboard,
  Package,
  ListOrdered,
  ShoppingCart,
  DollarSign,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Store,
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/painel', icon: LayoutDashboard },
  { name: 'Produtos', href: '/painel/produtos', icon: Package },
  { name: 'Categorias', href: '/painel/categorias', icon: ListOrdered },
  { name: 'Pedidos', href: '/painel/pedidos', icon: ShoppingCart },
  { name: 'Balcão / PDV', href: '/painel/balcao', icon: Store },
  { name: 'Financeiro', href: '/painel/financeiro', icon: DollarSign },
  { name: 'Configurações', href: '/painel/configuracoes', icon: Settings },
]

export default function PainelLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userName, setUserName] = useState<string>('')
  const [establishmentName, setEstablishmentName] = useState<string>('')

  useEffect(() => {
    const getUser = async () => {
      log('painel:layout', 'carregando usuário e estabelecimento...')
      try {
        const supabase = createClient()
        const { data: { user }, error: userError } = await supabase.auth.getUser()

        if (userError) logError('painel:layout', 'erro ao obter usuário', userError)

        if (!user) {
          log('painel:layout', 'sem usuário — middleware deveria ter redirecionado antes')
          return
        }

        setUserName(user.user_metadata?.name || user.email?.split('@')[0] || 'Usuário')

        // Buscar nome do estabelecimento
        const { data: est, error: estError } = await supabase
          .from('establishments')
          .select('name')
          .eq('owner_id', user.id)
          .maybeSingle()

        if (estError) logError('painel:layout', 'erro ao buscar estabelecimento', estError)

        if (est) {
          log('painel:layout', 'estabelecimento carregado', { name: est.name })
          setEstablishmentName(est.name)
        } else {
          // Conta criada mas a loja ainda não foi configurada
          // (ex: confirmação de e-mail estava ativada no cadastro).
          log('painel:layout', 'nenhum estabelecimento -> /completar-cadastro')
          router.push('/completar-cadastro')
        }
      } catch (err) {
        logError('painel:layout', 'exceção ao carregar usuário/estabelecimento', err)
      }
    }
    getUser()
  }, [router])

  const handleLogout = async () => {
    log('painel:layout', 'logout solicitado')
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signOut()
      if (error) logError('painel:layout', 'erro ao fazer logout', error)
    } catch (err) {
      logError('painel:layout', 'exceção ao fazer logout', err)
    } finally {
      router.push('/login')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <Link href="/painel" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">C</span>
              </div>
              <div>
                <span className="font-bold text-gray-900">CardápioSaaS</span>
                {establishmentName && (
                  <p className="text-xs text-gray-500 truncate max-w-[140px]">{establishmentName}</p>
                )}
              </div>
            </Link>
            <button
              className="lg:hidden p-1 rounded hover:bg-gray-100"
              onClick={() => setSidebarOpen(false)}
            >
              <X size={20} />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = pathname === item.href || 
                (item.href !== '/painel' && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon size={20} />
                  {item.name}
                </Link>
              )
            })}
          </nav>

          {/* User info & logout */}
          <div className="p-4 border-t border-gray-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                <span className="text-primary-700 font-medium text-sm">
                  {userName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{userName}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-600 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
            >
              <LogOut size={18} />
              Sair
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar (mobile) */}
        <div className="sticky top-0 z-30 lg:hidden bg-white border-b border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <button
              className="p-2 rounded-lg hover:bg-gray-100"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={24} />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">C</span>
              </div>
              <span className="font-bold text-gray-900">CardápioSaaS</span>
            </div>
            <div className="w-10" /> {/* Spacer */}
          </div>
        </div>

        {/* Page content */}
        <main className="p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
