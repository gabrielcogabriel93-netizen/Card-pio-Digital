'use client'

import { useEffect, useState } from 'react'
import { logError } from '@/lib/logger'
import { AlertTriangle, Copy, Loader2, TrendingUp, Users, CheckCircle2, XCircle } from 'lucide-react'

interface Indicacao {
  id: string
  criadoEm: string
  estabelecimentoNome: string
  ativo: boolean
}

interface Comissao {
  id: string
  criadoEm: string
  valor: number
  status: string
  estabelecimentoNome: string
}

interface DivulgadorData {
  nome: string
  codigoAfiliado: string
  percentualComissao: number
  onboardingComplete: boolean
  linkAfiliado: string
  indicacoes: Indicacao[]
  comissaoMesAtual: number
  historico: Comissao[]
}

export default function DivulgadorDashboardPage() {
  const [data, setData] = useState<DivulgadorData | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [gerandoLink, setGerandoLink] = useState(false)

  const load = async () => {
    try {
      const response = await fetch('/api/divulgador/me')
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Erro ao carregar dados')
      setData(json)
    } catch (err) {
      logError('divulgador:dashboard', 'erro ao carregar dados', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

  const formatDate = (value: string) => new Date(value).toLocaleDateString('pt-BR')

  const handleCopyLink = () => {
    if (!data) return
    navigator.clipboard.writeText(data.linkAfiliado)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleCompletarOnboarding = async () => {
    setGerandoLink(true)
    try {
      const response = await fetch('/api/divulgador/stripe-onboarding-link', { method: 'POST' })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Erro ao gerar link')
      window.location.href = json.onboardingUrl
    } catch (err) {
      logError('divulgador:dashboard', 'erro ao gerar link de onboarding', err)
      setGerandoLink(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary-500" />
      </div>
    )
  }

  if (!data) {
    return <p className="text-gray-600">Não foi possível carregar seus dados. Tente atualizar a página.</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Olá, {data.nome.split(' ')[0]}</h1>
        <p className="text-gray-600 mt-1">
          Você ganha {data.percentualComissao}% de comissão, todo mês, de forma recorrente, enquanto o
          estabelecimento que você indicou continuar assinando o CatalogAI. Quanto mais estabelecimentos
          ativos você trouxer, maior sua renda mensal.
        </p>
      </div>

      {!data.onboardingComplete && (
        <div className="card bg-amber-50 border-amber-200">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h2 className="font-semibold text-amber-900">Finalize seu cadastro bancário</h2>
              <p className="text-sm text-amber-800 mt-1 mb-3">
                Falta completar os dados bancários na Stripe para começar a receber suas comissões.
              </p>
              <button onClick={handleCompletarOnboarding} className="btn-primary" disabled={gerandoLink}>
                {gerandoLink ? <Loader2 size={18} className="animate-spin" /> : 'Completar cadastro bancário'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-2">Seu link de divulgação</h2>
        <div className="flex items-center gap-2">
          <input readOnly value={data.linkAfiliado} className="input-field flex-1 text-sm" />
          <button onClick={handleCopyLink} className="btn-secondary flex-shrink-0">
            <Copy size={16} />
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <TrendingUp size={16} />
            Comissão este mês
          </div>
          <p className="stat-value">{formatCurrency(data.comissaoMesAtual)}</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <Users size={16} />
            Estabelecimentos ativos
          </div>
          <p className="stat-value">{data.indicacoes.filter((i) => i.ativo).length}</p>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">Estabelecimentos indicados</h2>
        {data.indicacoes.length === 0 ? (
          <p className="text-sm text-gray-500">Você ainda não indicou nenhum estabelecimento.</p>
        ) : (
          <div className="space-y-2">
            {data.indicacoes.map((ind) => (
              <div key={ind.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{ind.estabelecimentoNome}</p>
                  <p className="text-xs text-gray-500">Indicado em {formatDate(ind.criadoEm)}</p>
                </div>
                {ind.ativo ? (
                  <span className="badge bg-green-100 text-green-700 flex items-center gap-1">
                    <CheckCircle2 size={12} /> Ativo
                  </span>
                ) : (
                  <span className="badge bg-gray-100 text-gray-600 flex items-center gap-1">
                    <XCircle size={12} /> Inativo
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">Histórico de comissões</h2>
        {data.historico.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma comissão registrada ainda.</p>
        ) : (
          <div className="space-y-2">
            {data.historico.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{c.estabelecimentoNome}</p>
                  <p className="text-xs text-gray-500">{formatDate(c.criadoEm)}</p>
                </div>
                <p className="text-sm font-semibold text-gray-900">{formatCurrency(c.valor)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
