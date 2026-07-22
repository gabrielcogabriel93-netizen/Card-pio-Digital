'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { log, logError } from '@/lib/logger'
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle, KeyRound } from 'lucide-react'

export default function RedefinirSenhaPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [invalidLink, setInvalidLink] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    // O link de e-mail do Supabase autentica o usuário via evento
    // PASSWORD_RECOVERY antes que a página termine de carregar.
    log('redefinir-senha', 'aguardando evento de autenticação do link de recuperação...')
    const supabase = createClient()
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      log('redefinir-senha', 'evento de auth recebido', { event, temSessao: !!session })
      if (event === 'PASSWORD_RECOVERY' || session) {
        setReady(true)
      }
    })

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
    })

    const timeout = setTimeout(() => {
      setReady((current) => {
        if (!current) {
          log('redefinir-senha', 'timeout de 4s sem sessão -> link inválido/expirado')
          setInvalidLink(true)
        }
        return current
      })
    }, 4000)

    return () => {
      listener.subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.')
      return
    }
    if (password !== confirmPassword) {
      setError('Senhas não conferem.')
      return
    }

    setSaving(true)
    log('redefinir-senha', 'atualizando senha...')
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({ password })

      if (updateError) {
        logError('redefinir-senha', 'erro ao atualizar senha', updateError)
        setError(updateError.message)
        return
      }

      log('redefinir-senha', 'senha atualizada com sucesso')
      setSuccess(true)
      setTimeout(() => router.push('/painel'), 1500)
    } catch (err: any) {
      logError('redefinir-senha', 'exceção ao atualizar senha', err)
      setError(err?.message || 'Erro inesperado. Tente novamente.')
    } finally {
      setSaving(false)
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
            <span className="font-bold text-2xl text-gray-900">Cardápio<span className="text-primary-500">SaaS</span></span>
          </Link>
        </div>

        <div className="card">
          {invalidLink ? (
            <div className="text-center">
              <AlertCircle size={40} className="text-red-400 mx-auto mb-4" />
              <h1 className="text-xl font-bold text-gray-900 mb-2">Link inválido ou expirado</h1>
              <p className="text-gray-600 mb-6">Solicite um novo link de redefinição na tela de login.</p>
              <Link href="/login" className="btn-primary w-full">Voltar ao login</Link>
            </div>
          ) : success ? (
            <div className="text-center">
              <CheckCircle size={40} className="text-green-500 mx-auto mb-4" />
              <h1 className="text-xl font-bold text-gray-900 mb-2">Senha atualizada!</h1>
              <p className="text-gray-600">Redirecionando para o painel...</p>
            </div>
          ) : !ready ? (
            <div className="flex flex-col items-center py-8">
              <Loader2 size={32} className="animate-spin text-primary-500 mb-3" />
              <p className="text-gray-600 text-sm">Validando link...</p>
            </div>
          ) : (
            <>
              <div className="w-14 h-14 bg-primary-50 rounded-full flex items-center justify-center mb-4">
                <KeyRound size={24} className="text-primary-500" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Nova senha</h1>
              <p className="text-gray-600 mb-6">Escolha uma nova senha para sua conta.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="input-field pr-10"
                      placeholder="Mínimo 6 caracteres"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      autoFocus
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar senha</label>
                  <input
                    type="password"
                    className="input-field"
                    placeholder="Repita a senha"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>

                {error && (
                  <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{error}</div>
                )}

                <button type="submit" className="btn-primary w-full" disabled={saving}>
                  {saving ? <Loader2 size={20} className="animate-spin" /> : 'Salvar nova senha'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
