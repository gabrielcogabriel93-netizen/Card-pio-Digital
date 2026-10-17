'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from '@/components/Feedback'
import { Globe, Loader2, CheckCircle2, AlertCircle, Lock } from 'lucide-react'

interface DomainStatus {
  domain: string | null
  automatic?: boolean
  verified?: boolean
  misconfigured?: boolean
  dns?: { type: 'A' | 'CNAME'; name: string; value: string }
}

/**
 * Domínio próprio em um clique (plano Completo). Salva pela rota
 * /api/domains, que adiciona o domínio na Vercel quando VERCEL_TOKEN está
 * configurado, e mostra o registro DNS exato que o lojista precisa criar.
 */
export function CustomDomainCard({ hasCompletoAccess, initialDomain }: { hasCompletoAccess: boolean; initialDomain: string | null }) {
  const [input, setInput] = useState(initialDomain || '')
  const [status, setStatus] = useState<DomainStatus | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = async () => {
    const res = await fetch('/api/domains')
    if (res.ok) setStatus(await res.json())
  }

  useEffect(() => {
    if (initialDomain) refresh()
  }, [initialDomain])

  const save = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/domains', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain: input }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar o domínio')
      setInput(data.domain)
      toast.success('Domínio salvo. Agora crie o registro DNS abaixo.')
      await refresh()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  const remove = async () => {
    setLoading(true)
    await fetch('/api/domains', { method: 'DELETE' })
    setInput('')
    setStatus(null)
    setLoading(false)
    toast('Domínio removido. O cardápio continua no link padrão.')
  }

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-1">
        <Globe size={20} className="text-gray-400" />
        <h2 className="text-lg font-semibold text-gray-900">Domínio próprio</h2>
        {!hasCompletoAccess && <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Completo</span>}
      </div>
      <p className="text-sm text-gray-500 mb-4">Seu cardápio no seu endereço, como <strong>cardapio.minhaloja.com.br</strong>. O cliente só vê a sua marca.</p>

      {!hasCompletoAccess ? (
        <p className="text-sm text-gray-600 flex items-center gap-2">
          <Lock size={15} /> Disponível no <Link href="/painel/planos" className="text-primary-600 underline">plano Completo</Link>.
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            <input className="input-field" placeholder="cardapio.minhaloja.com.br" value={input} onChange={(e) => setInput(e.target.value)} aria-label="Domínio próprio" />
            <button type="button" onClick={save} disabled={loading || !input.trim()} className="btn-primary flex-shrink-0">
              {loading ? <Loader2 size={18} className="animate-spin" /> : 'Salvar'}
            </button>
          </div>

          {status?.domain && (
            <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm space-y-3">
              {status.automatic && (
                <p className={`flex items-center gap-2 font-medium ${status.verified && !status.misconfigured ? 'text-green-700' : 'text-amber-700'}`}>
                  {status.verified && !status.misconfigured ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  {status.verified && !status.misconfigured ? 'Domínio funcionando' : 'Aguardando o registro DNS (pode levar algumas horas)'}
                </p>
              )}
              {status.dns && (
                <div>
                  <p className="text-gray-700 mb-2">No painel onde você comprou o domínio (Registro.br, GoDaddy, Hostinger...), crie este registro:</p>
                  <div className="grid grid-cols-3 gap-2 font-mono text-xs bg-white border border-gray-200 rounded-lg p-3">
                    <span className="text-gray-500">Tipo</span><span className="text-gray-500">Nome</span><span className="text-gray-500">Valor</span>
                    <span>{status.dns.type}</span><span>{status.dns.name}</span><span className="break-all">{status.dns.value}</span>
                  </div>
                </div>
              )}
              {!status.automatic && (
                <p className="text-xs text-gray-500">A plataforma ainda não está com a ativação automática ligada: depois de criar o DNS, fale com o suporte para concluir.</p>
              )}
              <div className="flex gap-3">
                <button type="button" onClick={refresh} className="text-primary-600 text-xs underline">Verificar de novo</button>
                <button type="button" onClick={remove} className="text-red-600 text-xs underline">Remover domínio</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
