'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { log, logError } from '@/lib/logger'
import { Loader2 } from 'lucide-react'

// Espelha app/completar-cadastro/page.tsx (fluxo do lojista): só existe
// pra cobrir o caso em que o cadastro exigiu confirmação de e-mail, então
// não havia sessão ativa em /divulgador/cadastro pra criar o perfil na
// hora. Depois de confirmar o e-mail e fazer login em /divulgador/login,
// o usuário cai aqui pra terminar (perfil + conta bancária Stripe).
export default function DivulgadorCompletarCadastroPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [needsName, setNeedsName] = useState(false)
  const [loading, setLoading] = useState(true)

  const finish = async (nomeParaEnviar?: string) => {
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push('/divulgador/login')
        return
      }

      const response = await fetch('/api/divulgador/cadastro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nomeParaEnviar || user.user_metadata?.nome || '' }),
      })
      const data = await response.json()
      if (!response.ok) {
        // Sem nome ainda (metadado do signUp não veio, ex: usuário criado
        // de outro jeito) -- pede pra digitar em vez de travar o fluxo.
        if (response.status === 400) {
          setNeedsName(true)
          setLoading(false)
          return
        }
        throw new Error(data.error || 'Erro ao completar cadastro')
      }

      log('divulgador:completar-cadastro', 'redirecionando pro onboarding Stripe...')
      window.location.href = data.onboardingUrl
    } catch (err: any) {
      logError('divulgador:completar-cadastro', 'erro ao completar cadastro', err)
      setError(err.message)
      setLoading(false)
    }
  }

  useEffect(() => {
    finish()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (needsName) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-blue-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md card">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Só mais um passo</h1>
          <p className="text-gray-600 mb-4">Como podemos te chamar?</p>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              finish(nome)
            }}
            className="space-y-4"
          >
            <input
              type="text"
              className="input-field"
              placeholder="Seu nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              autoFocus
            />
            {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{error}</div>}
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? <Loader2 size={20} className="animate-spin" /> : 'Continuar'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-blue-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md card text-center">
        {error ? (
          <>
            <p className="text-red-600 mb-4">{error}</p>
            <button onClick={() => finish()} className="btn-primary w-full">
              Tentar de novo
            </button>
            <Link href="/divulgador/login" className="block mt-3 text-sm text-gray-500">
              Voltar pro login
            </Link>
          </>
        ) : (
          <>
            <Loader2 size={28} className="animate-spin text-primary-500 mx-auto mb-4" />
            <p className="text-gray-600">Preparando seu cadastro...</p>
          </>
        )}
      </div>
    </div>
  )
}
