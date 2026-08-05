'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { log, logError } from '@/lib/logger'
import { Eye, EyeOff, Loader2, Mail } from 'lucide-react'

// Cadastro público, compartilhado pelo admin (ver app/admin, aba
// Divulgadores) -- mesma estrutura de app/cadastro/page.tsx (auth do
// lojista): supabase.auth.signUp() primeiro, e só depois cria a linha de
// perfil (aqui via /api/divulgador/cadastro, que também cria a conta
// conectada Stripe -- por isso não dá pra fazer direto do client, como
// createEstablishmentWithUniqueSlug faz pra loja).
export default function DivulgadorCadastroPage() {
  const [formData, setFormData] = useState({ nome: '', email: '', password: '', confirmPassword: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (formData.password !== formData.confirmPassword) {
      setError('Senhas não conferem.')
      setLoading(false)
      return
    }
    if (formData.password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.')
      setLoading(false)
      return
    }

    const supabase = createClient()

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: { data: { nome: formData.nome, divulgador: true } },
      })
      if (authError) throw new Error(authError.message)
      if (!authData.user) throw new Error('Erro ao criar usuário.')

      // Sem sessão ativa = confirmação de e-mail habilitada no projeto.
      // O perfil de divulgador (e a conta Stripe) só é criado quando
      // existir sessão -- ver /divulgador/completar-cadastro, chamado
      // depois que o usuário confirma o e-mail e faz login.
      if (!authData.session) {
        setAwaitingConfirmation(true)
        setLoading(false)
        return
      }

      const response = await fetch('/api/divulgador/cadastro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: formData.nome }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Erro ao criar perfil de divulgador')

      log('divulgador:cadastro', 'redirecionando pro onboarding Stripe...')
      window.location.href = data.onboardingUrl
    } catch (err: any) {
      logError('divulgador:cadastro', 'erro no fluxo de cadastro', err)
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-blue-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 bg-primary-500 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-lg">C</span>
            </div>
            <span className="font-bold text-2xl text-gray-900">Catalog<span className="text-primary-500">AI</span></span>
          </Link>
          <p className="text-sm text-gray-500 mt-2">Seja um divulgador</p>
        </div>

        {awaitingConfirmation ? (
          <div className="card text-center">
            <div className="w-16 h-16 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail size={28} className="text-primary-500" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Confirme seu e-mail</h1>
            <p className="text-gray-600 mb-6">
              Enviamos um link de confirmação para <strong>{formData.email}</strong>. Clique no link e
              depois faça login para finalizar seu cadastro (falta só o cadastro bancário).
            </p>
            <Link href="/divulgador/login" className="btn-primary w-full">
              Ir para o login
            </Link>
          </div>
        ) : (
          <div className="card">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Cadastro de divulgador</h1>
            <p className="text-gray-600 mb-6">
              Indique estabelecimentos pro CatalogAI e ganhe comissão recorrente enquanto a assinatura
              deles estiver ativa.
            </p>

            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label htmlFor="nome" className="block text-sm font-medium text-gray-700 mb-1">
                  Nome
                </label>
                <input
                  id="nome"
                  type="text"
                  className="input-field"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  required
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  E-mail
                </label>
                <input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  className="input-field"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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
                    className="input-field pr-10"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
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

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  Confirmar senha
                </label>
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  className="input-field"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  required
                />
              </div>

              {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{error}</div>}

              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? <Loader2 size={20} className="animate-spin" /> : 'Criar cadastro'}
              </button>
            </form>

            <div className="mt-6 text-center text-sm text-gray-600">
              Já é divulgador?{' '}
              <Link href="/divulgador/login" className="text-primary-600 hover:text-primary-700 font-medium">
                Entrar
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
