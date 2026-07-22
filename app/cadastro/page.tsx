'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { createEstablishmentWithUniqueSlug, slugify } from '@/lib/establishment'
import { formatPhoneNumber } from '@/lib/phone'
import { log, logError } from '@/lib/logger'
import { Eye, EyeOff, Loader2, CheckCircle, AlertCircle, Mail } from 'lucide-react'

export default function CadastroPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    establishmentName: '',
    whatsapp: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [slug, setSlug] = useState('')
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  const handleEstablishmentNameChange = (value: string) => {
    setFormData({ ...formData, establishmentName: value })
    setSlug(slugify(value))
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    log('cadastro', 'submit do formulário (passo 2)', { email: formData.email })

    if (formData.password !== formData.confirmPassword) {
      log('cadastro', 'validação falhou: senhas não conferem')
      setError('Senhas não conferem.')
      setLoading(false)
      return
    }

    if (formData.password.length < 6) {
      log('cadastro', 'validação falhou: senha curta')
      setError('A senha deve ter no mínimo 6 caracteres.')
      setLoading(false)
      return
    }

    const supabase = createClient()

    try {
      // 1. Criar usuário no Supabase Auth. Os dados da loja ficam guardados
      // nos metadados do usuário para o caso de a confirmação de e-mail
      // estar ativada (nesse caso ainda não há sessão para criar o registro
      // do estabelecimento, que será concluído em /completar-cadastro).
      log('cadastro', 'chamando auth.signUp...')
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            name: formData.name,
            pending_establishment_name: formData.establishmentName,
            pending_whatsapp_number: formData.whatsapp,
          },
        },
      })

      if (authError) {
        logError('cadastro', 'signUp retornou erro', authError)
        throw new Error(authError.message)
      }
      if (!authData.user) throw new Error('Erro ao criar usuário.')
      log('cadastro', 'signUp concluído', { userId: authData.user.id, temSessao: !!authData.session })

      // Sem sessão ativa = confirmação de e-mail está habilitada no projeto.
      if (!authData.session) {
        log('cadastro', 'sem sessão -> aguardando confirmação de e-mail')
        setAwaitingConfirmation(true)
        setLoading(false)
        return
      }

      // 2. Criar estabelecimento (com resolução automática de slug duplicado)
      log('cadastro', 'criando estabelecimento...', { establishmentName: formData.establishmentName })
      const establishment = await createEstablishmentWithUniqueSlug(supabase, {
        ownerId: authData.user.id,
        name: formData.establishmentName,
        whatsappNumber: formData.whatsapp,
      })
      log('cadastro', 'estabelecimento criado', { id: establishment?.id, slug: establishment?.slug })

      log('cadastro', 'redirecionando para /painel...')
      router.push('/painel')
      router.refresh()
    } catch (err: any) {
      logError('cadastro', 'erro no fluxo de cadastro', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-blue-50 flex items-center justify-center px-4 py-8">
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

        {awaitingConfirmation ? (
          <div className="card text-center">
            <div className="w-16 h-16 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail size={28} className="text-primary-500" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Confirme seu e-mail</h1>
            <p className="text-gray-600 mb-6">
              Enviamos um link de confirmação para <strong>{formData.email}</strong>. Clique no link
              e depois faça login para concluir a configuração da sua loja.
            </p>
            <Link href="/login" className="btn-primary w-full">
              Ir para o login
            </Link>
          </div>
        ) : (
        <>
        {/* Steps Indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            step >= 1 ? 'bg-primary-500 text-white' : 'bg-gray-200 text-gray-400'
          }`}>
            <CheckCircle size={16} />
          </div>
          <div className={`h-1 w-12 ${step >= 2 ? 'bg-primary-500' : 'bg-gray-200'}`} />
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            step >= 2 ? 'bg-primary-500 text-white' : 'bg-gray-200 text-gray-400'
          }`}>
            2
          </div>
        </div>

        <div className="card">
          {step === 1 ? (
            <>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Criar conta</h1>
              <p className="text-gray-600 mb-6">Informe seus dados pessoais para começar.</p>

              <form onSubmit={(e) => { e.preventDefault(); setStep(2) }} className="space-y-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                    Seu nome
                  </label>
                  <input
                    id="name"
                    type="text"
                    placeholder="Seu nome completo"
                    className="input-field"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
                      placeholder="Mínimo 6 caracteres"
                      className="input-field pr-10"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required
                      minLength={6}
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
                    type="password"
                    placeholder="Repita a senha"
                    className="input-field"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    required
                  />
                </div>

                <button type="submit" className="btn-primary w-full">
                  Próximo passo
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Seu estabelecimento</h1>
              <p className="text-gray-600 mb-6">Agora, conte-nos sobre seu negócio.</p>

              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label htmlFor="estName" className="block text-sm font-medium text-gray-700 mb-1">
                    Nome do estabelecimento
                  </label>
                  <input
                    id="estName"
                    type="text"
                    placeholder="Ex: Pizzaria do João"
                    className="input-field"
                    value={formData.establishmentName}
                    onChange={(e) => handleEstablishmentNameChange(e.target.value)}
                    required
                  />
                  {slug && (
                    <p className="text-xs text-gray-500 mt-1">
                      Seu link: {typeof window !== 'undefined' ? window.location.host : ''}/loja/{slug}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="whatsapp" className="block text-sm font-medium text-gray-700 mb-1">
                    WhatsApp para receber pedidos
                  </label>
                  <input
                    id="whatsapp"
                    type="tel"
                    placeholder="(11) 99999-8888"
                    className="input-field"
                    value={formData.whatsapp}
                    onChange={(e) => setFormData({ ...formData, whatsapp: formatPhoneNumber(e.target.value) })}
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Os pedidos dos clientes serão enviados para este número.
                  </p>
                </div>

                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                    required
                  />
                  <span className="text-sm text-gray-600">
                    Li e concordo com os{' '}
                    <Link href="/termos" target="_blank" className="text-primary-600 hover:underline">
                      Termos de Uso
                    </Link>{' '}
                    e a{' '}
                    <Link href="/privacidade" target="_blank" className="text-primary-600 hover:underline">
                      Política de Privacidade
                    </Link>
                    .
                  </span>
                </label>

                {error && (
                  <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-start gap-2">
                    <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex gap-3">
                  <button type="button" onClick={() => setStep(1)} className="btn-secondary flex-1">
                    Voltar
                  </button>
                  <button type="submit" className="btn-primary flex-1" disabled={loading || !acceptedTerms}>
                    {loading ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      'Criar conta grátis'
                    )}
                  </button>
                </div>
              </form>
            </>
          )}

          <div className="mt-6 text-center text-sm text-gray-600">
            Já tem conta?{' '}
            <Link href="/login" className="text-primary-600 hover:text-primary-700 font-medium">
              Fazer login
            </Link>
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  )
}
