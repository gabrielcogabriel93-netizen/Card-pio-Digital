'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { saveCustomerToken } from '@/lib/customerStorage'
import { VerifyPhone } from '@/components/store/VerifyPhone'
import { Loader2, ShieldCheck } from 'lucide-react'

interface Challenge {
  challenge_id: string
  items: string[]
  totals: string[]
}

/**
 * Ver o histórico em qualquer aparelho: duas perguntas rápidas sobre o
 * último pedido (um item e o valor). Acertando, o aparelho vê os pedidos
 * e pede de novo (migration 053). O número do pedido continua como
 * alternativa e libera também endereços e pontos.
 */
export function HistoryChallenge({ establishmentId, phone, onVerified }: { establishmentId: string; phone: string; onVerified: () => void }) {
  const [step, setStep] = useState<'intro' | 'questions' | 'none' | 'code'>('intro')
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [item, setItem] = useState('')
  const [total, setTotal] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const begin = async () => {
    setLoading(true)
    setError(null)
    setItem('')
    setTotal('')
    try {
      const { data, error: rpcError } = await createClient().rpc('start_customer_challenge', { p_establishment_id: establishmentId, p_phone: phone })
      if (rpcError) {
        // Banco ainda sem a migration 053: oferece o número do pedido.
        if (rpcError.code === 'PGRST202' || /start_customer_challenge/.test(rpcError.message)) {
          throw new Error('Essa forma de confirmar ainda está sendo ativada. Por enquanto, use o número de um pedido (abaixo).')
        }
        throw new Error(rpcError.message)
      }
      if (!data) {
        setStep('none')
        return
      }
      setChallenge(data as Challenge)
      setStep('questions')
    } catch (err: any) {
      setError(err.message || 'Não foi possível começar agora.')
    } finally {
      setLoading(false)
    }
  }

  const confirm = async () => {
    if (!challenge || !item || !total) {
      setError('Responda as duas perguntas.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data, error: rpcError } = await createClient().rpc('answer_customer_challenge', { p_challenge_id: challenge.challenge_id, p_item: item, p_total: total })
      if (rpcError) throw new Error(rpcError.message)
      if (!data) {
        setChallenge(null)
        setStep('intro')
        setError('As respostas não conferem com o seu último pedido. Você pode tentar de novo (até 3 vezes por dia).')
        return
      }
      saveCustomerToken(establishmentId, phone, data as string)
      onVerified()
    } catch (err: any) {
      setError(err.message || 'Não foi possível confirmar.')
      setStep('intro')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'code') {
    return (
      <div className="space-y-2">
        <VerifyPhone establishmentId={establishmentId} phone={phone} onVerified={onVerified} />
        <button type="button" onClick={() => setStep('intro')} className="text-sm text-primary-700 underline">Prefiro responder às perguntas</button>
      </div>
    )
  }

  const option = (value: string, selected: string, set: (v: string) => void) => (
    <button
      key={value}
      type="button"
      role="radio"
      aria-checked={selected === value}
      onClick={() => set(value)}
      className={`rounded-xl border-2 px-3 py-2.5 text-sm text-left ${selected === value ? 'border-primary-500 bg-primary-50 text-primary-800 font-medium' : 'border-gray-200 bg-white text-gray-700'}`}
    >
      {value}
    </button>
  )

  return (
    <div className="rounded-2xl bg-white border border-gray-100 p-4 space-y-4">
      <div className="flex items-start gap-2.5">
        <ShieldCheck size={20} className="text-primary-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-gray-900">Confirme que os pedidos são seus</p>
          <p className="text-sm text-gray-600 mt-0.5">Para ver seu histórico neste aparelho, responda 2 perguntas rápidas sobre o seu último pedido.</p>
        </div>
      </div>

      {step === 'intro' && (
        <button type="button" onClick={begin} disabled={loading} className="btn-primary w-full py-3">
          {loading ? <Loader2 size={18} className="animate-spin" /> : 'Responder às perguntas'}
        </button>
      )}

      {step === 'none' && (
        <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3">
          Não encontramos pedidos recentes com esse telefone nesta loja. Confira o número ou faça seu primeiro pedido pelo cardápio.
        </p>
      )}

      {step === 'questions' && challenge && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-800 mb-2">1. Qual destes itens estava no seu último pedido?</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup">{challenge.items.map((v) => option(v, item, setItem))}</div>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-800 mb-2">2. Qual foi o valor do seu último pedido?</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup">{challenge.totals.map((v) => option(v, total, setTotal))}</div>
          </div>
          <button type="button" onClick={confirm} disabled={loading || !item || !total} className="btn-primary w-full py-3">
            {loading ? <Loader2 size={18} className="animate-spin" /> : 'Confirmar'}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

      <button type="button" onClick={() => setStep('code')} className="text-sm text-gray-500 underline">Tenho o número de um pedido</button>
    </div>
  )
}
