'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { log, logError } from '@/lib/logger'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

// Login separado de /login de propósito: é outra "pessoa" logando (o
// divulgador, não o dono de um estabelecimento), com sua própria linha
// em `divulgadores` -- ver migrations/034_divulgadores_stripe.sql. Usa o
// mesmo Supabase Auth por baixo (auth.uid()), só a área/painel é
// diferente.
export default function DivulgadorLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        logError('divulgador:login', 'signInWithPassword retornou erro', error)
        setError(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message)
        return
      }

      log('divulgador:login', 'login bem-sucedido', { userId: data.user?.id })
      router.push('/divulgador/dashboard')
      router.refresh()
    } catch (err: any) {
      logError('divulgador:login', 'exceção inesperada no login', err)
      setError(err?.message || 'Erro inesperado ao entrar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-blue-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 bg-primary-500 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-lg">C</span>
            </div>
            <span className="font-bold text-2xl text-gray-900">Catalog<span className="text-primary-500">AI</span></span>
          </Link>
          <p className="text-sm text-gray-500 mt-2">Painel do divulgador</p>
        </div>

        <div className="card">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Acessar painel</h1>
          <p className="text-gray-600 mb-6">Entre para ver suas indicações e comissões.</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                placeholder="seu@email.com"
                className="input-field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Senha
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Sua senha"
                  className="input-field pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{error}</div>}

            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? <Loader2 size={20} className="animate-spin" /> : 'Entrar'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600">
            Ainda não é divulgador?{' '}
            <Link href="/divulgador/cadastro" className="text-primary-600 hover:text-primary-700 font-medium">
              Cadastre-se
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
