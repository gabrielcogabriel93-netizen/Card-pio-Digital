'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { log, logError } from '@/lib/logger'
import { useEscapeKey } from '@/lib/useEscapeKey'
import { Eye, EyeOff, Loader2, Mail } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showReset, setShowReset] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  useEscapeKey(() => setShowReset(false), showReset)

  useEffect(() => {
    log('login', 'variáveis de ambiente do Supabase', {
      hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    })

    // Se o usuário chegou aqui por um link de confirmação de e-mail do
    // Supabase (sessão criada a partir do fragmento da URL), já entra
    // direto no painel em vez de pedir login novamente.
    const supabase = createClient()
    log('login', 'verificando sessão existente...')
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          logError('login', 'erro ao verificar sessão existente', error)
          return
        }
        log('login', 'resultado da verificação de sessão', { temSessao: !!data.session })
        if (data.session) {
          log('login', 'sessão já existente, redirecionando para /painel')
          router.push('/painel')
          router.refresh()
        }
      })
      .catch((err) => logError('login', 'exceção ao verificar sessão existente', err))
  }, [router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    log('login', 'submit do formulário de login', { email })

    try {
      const supabase = createClient()
      log('login', 'chamando signInWithPassword...')
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        logError('login', 'signInWithPassword retornou erro', error)
        setError(error.message)
        return
      }

      log('login', 'login bem-sucedido', { userId: data.user?.id })
      log('login', 'redirecionando para /painel...')
      router.push('/painel')
      router.refresh()
    } catch (err: any) {
      logError('login', 'exceção inesperada no login', err)
      setError(err?.message || 'Erro inesperado ao entrar. Tente novamente.')
    } finally {
      // Garante que o botão nunca fique preso girando, mesmo se algo
      // acima lançar uma exceção não prevista.
      setLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setResetLoading(true)
    log('login', 'solicitando redefinição de senha', { email })

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      })
      if (error) {
        logError('login', 'erro ao solicitar redefinição de senha', error)
      } else {
        log('login', 'e-mail de redefinição solicitado com sucesso')
      }
    } catch (err) {
      logError('login', 'exceção ao solicitar redefinição de senha', err)
    } finally {
      // Sempre mostra a mesma mensagem de sucesso, exista ou não o e-mail,
      // para não revelar quais e-mails estão cadastrados.
      setResetLoading(false)
      setResetSent(true)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-blue-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 bg-primary-500 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-lg">C</span>
            </div>
            <span className="font-bold text-2xl text-gray-900">Cardápio<span className="text-primary-500">SaaS</span></span>
          </Link>
        </div>

        <div className="card">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Acessar painel</h1>
          <p className="text-gray-600 mb-6">Entre com suas credenciais para gerenciar seu cardápio.</p>

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
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
                {error === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error}
              </div>
            )}

            <div className="text-right -mt-2">
              <button
                type="button"
                onClick={() => { setShowReset(true); setResetSent(false) }}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                Esqueci minha senha
              </button>
            </div>

            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                'Entrar'
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600">
            Ainda não tem conta?{' '}
            <Link href="/cadastro" className="text-primary-600 hover:text-primary-700 font-medium">
              Criar conta grátis
            </Link>
          </div>
        </div>
      </div>

      {/* Reset Password Modal */}
      {showReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowReset(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6 animate-fade-in">
            {resetSent ? (
              <div className="text-center">
                <div className="w-14 h-14 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Mail size={24} className="text-primary-500" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Verifique seu e-mail</h2>
                <p className="text-sm text-gray-600 mb-4">
                  Se houver uma conta associada a <strong>{email}</strong>, enviamos um link para
                  redefinir sua senha.
                </p>
                <button onClick={() => setShowReset(false)} className="btn-primary w-full">
                  Fechar
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword}>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Redefinir senha</h2>
                <p className="text-sm text-gray-600 mb-4">
                  Informe seu e-mail para receber um link de redefinição de senha.
                </p>
                <input
                  type="email"
                  className="input-field mb-4"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowReset(false)} className="btn-secondary flex-1">
                    Cancelar
                  </button>
                  <button type="submit" className="btn-primary flex-1" disabled={resetLoading || !email.trim()}>
                    {resetLoading ? <Loader2 size={18} className="animate-spin" /> : 'Enviar link'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
