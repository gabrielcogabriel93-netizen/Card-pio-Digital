'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { logError } from '@/lib/logger'
import { Copy, Loader2, Lock, CheckCircle2 } from 'lucide-react'

const POLL_INTERVAL_MS = 3000

interface SubscriptionPaywallProps {
  reason: 'trial_expired' | 'subscription_expired'
  monthlyPrice: number
  onUnlocked: () => void
}

type Step = 'intro' | 'waiting' | 'approved'

// Tela cheia que substitui o painel inteiro quando get_my_subscription_status()
// diz que está bloqueado — nunca aparece no cardápio público, só em
// /painel/**. Assim que o pagamento cai, o próprio polling detecta e
// chama onUnlocked() pra liberar o acesso sem precisar recarregar nada.
export function SubscriptionPaywall({ reason, monthlyPrice, onUnlocked }: SubscriptionPaywallProps) {
  const [step, setStep] = useState<Step>('intro')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [qrCode, setQrCode] = useState('')
  const [qrCodeBase64, setQrCodeBase64] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (step !== 'waiting') return

    const poll = async () => {
      try {
        const supabase = createClient()
        const { data, error: rpcError } = await supabase.rpc('get_my_subscription_status')
        if (rpcError) throw rpcError
        const status = data?.[0]
        if (status && !status.blocked) {
          setStep('approved')
          setTimeout(onUnlocked, 1500)
        }
      } catch (err) {
        logError('painel:paywall', 'erro ao consultar status da assinatura', err)
      }
    }

    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [step, onUnlocked])

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

  const handleGeneratePix = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/subscription/create-payment', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Erro ao gerar o Pix')
      setQrCode(data.qrCode)
      setQrCodeBase64(data.qrCodeBase64)
      setStep('waiting')
    } catch (err: any) {
      logError('painel:paywall', 'erro ao gerar Pix da assinatura', err)
      setError(err.message || 'Erro ao gerar o Pix')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(qrCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      logError('painel:paywall', 'erro ao copiar código Pix', err)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-xl p-6 text-center">
        {step === 'approved' ? (
          <>
            <CheckCircle2 size={48} className="text-green-500 mx-auto mb-3" />
            <p className="font-semibold text-gray-900 mb-1">Pagamento confirmado!</p>
            <p className="text-sm text-gray-600">Liberando seu painel...</p>
          </>
        ) : step === 'waiting' ? (
          <>
            <p className="text-sm font-medium text-gray-700 mb-3">Pague {formatCurrency(monthlyPrice)} com Pix</p>
            {qrCodeBase64 && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`data:image/png;base64,${qrCodeBase64}`}
                alt="QR Code Pix"
                className="mx-auto rounded-lg"
                width={220}
                height={220}
              />
            )}
            <button type="button" onClick={handleCopy} className="btn-secondary text-sm mt-3 w-full">
              <Copy size={14} />
              {copied ? 'Código copiado!' : 'Copiar código Pix'}
            </button>
            <div className="flex items-center justify-center gap-2 mt-4 text-sm text-gray-500">
              <Loader2 size={16} className="animate-spin" />
              Aguardando pagamento...
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Assim que o pagamento cair, seu painel é liberado sozinho — não precisa atualizar a página.
            </p>
          </>
        ) : (
          <>
            <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Lock size={26} className="text-amber-600" />
            </div>
            <p className="font-semibold text-gray-900 mb-1">
              {reason === 'trial_expired' ? 'Seu período grátis acabou' : 'Assinatura vencida'}
            </p>
            <p className="text-sm text-gray-600 mb-4">
              Pra continuar usando o painel, assine o plano mensal por {formatCurrency(monthlyPrice)}/mês. Seu
              cardápio público continua no ar normalmente — o bloqueio é só aqui, na área de gestão.
            </p>
            <button onClick={handleGeneratePix} disabled={loading} className="btn-primary w-full">
              {loading ? <Loader2 size={18} className="animate-spin" /> : 'Assinar agora'}
            </button>
            {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
          </>
        )}
      </div>
    </div>
  )
}
