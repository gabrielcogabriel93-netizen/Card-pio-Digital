'use client'

import { useState } from 'react'
import { logError } from '@/lib/logger'
import { COMPLETO_MONTHLY_PRICE, type PlanTier } from '@/lib/plans'
import { Loader2, Lock, Layers } from 'lucide-react'

interface SubscriptionPaywallProps {
  reason: 'trial_expired' | 'subscription_expired'
  monthlyPrice: number
  onUnlocked: () => void
}

// Tela cheia que substitui o painel inteiro quando get_my_subscription_status()
// diz que está bloqueado — nunca aparece no cardápio público, só em
// /painel/**.
//
// Corrige um bug pré-existente: esta tela ainda esperava {qrCode,
// qrCodeBase64} de um fluxo Pix que não existe mais -- a cobrança da
// assinatura da plataforma é Stripe Checkout (migration 034) desde
// antes desta rodada de mudanças, e /api/subscription/create-payment
// já devolve só {url}. O botão "Assinar agora" nunca redirecionava de
// verdade. Agora segue o mesmo `window.location.href = data.url` que
// app/painel/planos/page.tsx já fazia certo.
//
// `onUnlocked` não é mais usado por um polling daqui (o Checkout é uma
// navegação externa de verdade, não um QR pra ficar esperando na
// mesma tela) -- fica só como prop aceita pra não quebrar quem chama
// este componente; o desbloqueio acontece naturalmente quando o dono
// volta pro painel após o Checkout e o layout busca o status de novo.
export function SubscriptionPaywall({ reason, monthlyPrice }: SubscriptionPaywallProps) {
  const [loadingTier, setLoadingTier] = useState<PlanTier | null>(null)
  const [error, setError] = useState<string | null>(null)

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

  const handleSubscribe = async (tier: PlanTier) => {
    setLoadingTier(tier)
    setError(null)
    try {
      const response = await fetch('/api/subscription/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Erro ao iniciar assinatura')
      window.location.href = data.url
    } catch (err: any) {
      logError('painel:paywall', 'erro ao iniciar assinatura', err)
      setError(err.message || 'Erro ao iniciar assinatura')
      setLoadingTier(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl p-6 text-center">
        <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <Lock size={26} className="text-amber-600" />
        </div>
        <p className="font-semibold text-gray-900 mb-1">
          {reason === 'trial_expired' ? 'Seu período grátis acabou' : 'Assinatura vencida'}
        </p>
        <p className="text-sm text-gray-600 mb-5">
          Pra continuar usando o painel, escolha um plano. Seu cardápio público continua no ar normalmente — o
          bloqueio é só aqui, na área de gestão.
        </p>

        <div className="space-y-3">
          <button
            onClick={() => handleSubscribe('essencial')}
            disabled={loadingTier !== null}
            className="w-full border-2 border-gray-200 hover:border-primary-300 rounded-xl p-4 text-left transition-colors disabled:opacity-60"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-900">Essencial</span>
              <span className="font-bold text-gray-900">{formatCurrency(monthlyPrice)}/mês</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Cardápio digital, pedidos por WhatsApp, entrega/retirada e mais.</p>
            {loadingTier === 'essencial' && <Loader2 size={16} className="animate-spin mx-auto mt-2 text-primary-500" />}
          </button>

          <button
            onClick={() => handleSubscribe('completo')}
            disabled={loadingTier !== null}
            className="w-full border-2 border-primary-500 bg-primary-50 rounded-xl p-4 text-left transition-colors disabled:opacity-60"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-900 flex items-center gap-1.5">
                <Layers size={16} className="text-primary-600" /> Completo
              </span>
              <span className="font-bold text-gray-900">{formatCurrency(COMPLETO_MONTHLY_PRICE)}/mês</span>
            </div>
            <p className="text-xs text-gray-600 mt-1">
              Tudo do Essencial + estoque, Balcão/PDV, fidelidade, cupons, Pix automático, mesa com QR e relatórios.
            </p>
            {loadingTier === 'completo' && <Loader2 size={16} className="animate-spin mx-auto mt-2 text-primary-500" />}
          </button>
        </div>

        {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
      </div>
    </div>
  )
}
