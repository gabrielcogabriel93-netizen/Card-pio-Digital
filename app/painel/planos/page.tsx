'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { logError } from '@/lib/logger'
import { COMPLETO_MONTHLY_PRICE, ESSENCIAL_FEATURES, COMPLETO_FEATURES, type PlanTier } from '@/lib/plans'
import { Heart, CheckCircle2, Copy, X, Gift, Sparkles, MessageCircle, Loader2, Clock, CreditCard, Layers } from 'lucide-react'

// Contato pra quem quiser saber mais sobre os planos pagos que ainda
// estão em preparação — nenhum checkout de verdade acontece aqui, só
// o CTA de contato (não há credencial de gateway de pagamento). Mesmo
// número já usado na doação Pix acima.
const CONTACT_WHATSAPP = '5521972652314'

// Chave PIX (telefone) para doações. Formato E.164 (+55 + DDD + número) —
// é o que a maioria dos apps de banco espera ao colar uma chave "celular".
const PIX_PHONE_DISPLAY = '(21) 97265-2314'
const PIX_PHONE_KEY = '+5521972652314'

interface SubscriptionInfo {
  blocked: boolean
  status: 'trial' | 'active' | 'exempt'
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  monthlyPrice: number
  billingEnabled: boolean
  planTier: PlanTier
  hasCompletoAccess: boolean
}

export default function PlanosPage() {
  const [showDonateModal, setShowDonateModal] = useState(false)
  const [copied, setCopied] = useState(false)
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null)
  const [loadingSub, setLoadingSub] = useState(true)
  const [startingCheckout, setStartingCheckout] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  useEffect(() => {
    const loadSubscription = async () => {
      try {
        const supabase = createClient()
        const { data, error } = await supabase.rpc('get_my_subscription_status')
        if (error) throw error
        const row = data?.[0]
        if (row) {
          setSubscription({
            blocked: !!row.blocked,
            status: row.status,
            trialEndsAt: row.trial_ends_at,
            currentPeriodEnd: row.current_period_end,
            monthlyPrice: Number(row.monthly_price),
            billingEnabled: !!row.billing_enabled,
            planTier: row.plan_tier === 'completo' ? 'completo' : 'essencial',
            hasCompletoAccess: !!row.completo_access,
          })
        }
      } catch (err) {
        logError('painel:planos', 'erro ao carregar status da assinatura', err)
      } finally {
        setLoadingSub(false)
      }
    }
    loadSubscription()
  }, [])

  const handleAssinar = async (tier: PlanTier) => {
    setStartingCheckout(true)
    setCheckoutError(null)
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
      logError('painel:planos', 'erro ao iniciar checkout da assinatura', err)
      setCheckoutError(err.message || 'Erro ao iniciar assinatura')
      setStartingCheckout(false)
    }
  }

  const handleCopyPix = () => {
    navigator.clipboard.writeText(PIX_PHONE_KEY)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

  const formatDate = (value: string | null) =>
    value ? new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="page-title">Planos</h1>
        <p className="text-gray-600 mt-1">Sua assinatura e como apoiar o projeto.</p>
      </div>

      {/* Status atual */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-primary-500" />
            <h2 className="text-lg font-semibold text-gray-900">Seu plano</h2>
          </div>
          {loadingSub ? (
            <Loader2 size={16} className="animate-spin text-gray-400" />
          ) : !subscription || !subscription.billingEnabled ? (
            <span className="badge bg-primary-100 text-primary-700">7 dias grátis</span>
          ) : subscription.status === 'exempt' ? (
            <span className="badge bg-purple-100 text-purple-700">Isento</span>
          ) : subscription.status === 'active' ? (
            <span className="badge bg-green-100 text-green-700">Assinante</span>
          ) : (
            <span className="badge bg-blue-100 text-blue-700">Período de teste</span>
          )}
        </div>

        {!loadingSub && subscription && (
          !subscription.billingEnabled ? (
            <p className="text-gray-600 text-sm">
              Você tem 7 dias grátis, com todas as funcionalidades dos dois planos já liberadas — sem
              precisar de cartão de crédito.
            </p>
          ) : subscription.status === 'exempt' ? (
            <p className="text-gray-600 text-sm">
              Sua conta tem acesso liberado por cortesia, sem cobrança da mensalidade.
            </p>
          ) : subscription.status === 'active' ? (
            <p className="text-gray-600 text-sm">
              Plano {subscription.planTier === 'completo' ? 'Completo' : 'Essencial'}
              {formatDate(subscription.currentPeriodEnd) && (
                <> — renova em {formatDate(subscription.currentPeriodEnd)}.</>
              )}
            </p>
          ) : (
            <p className="text-gray-600 text-sm">
              {formatDate(subscription.trialEndsAt) ? (
                <>Seu período de teste grátis termina em {formatDate(subscription.trialEndsAt)}, com tudo
                liberado até lá. Depois disso, escolha um dos planos abaixo pra continuar usando o painel.</>
              ) : (
                <>Você ainda está no período de teste, sem prazo definido, com tudo liberado.</>
              )}
            </p>
          )
        )}
      </div>

      {checkoutError && (
        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{checkoutError}</div>
      )}

      {/* Dois planos */}
      <div className="grid sm:grid-cols-2 gap-4">
        {(
          [
            { tier: 'essencial' as PlanTier, name: 'Essencial', price: subscription?.monthlyPrice ?? 49.9, features: ESSENCIAL_FEATURES },
            { tier: 'completo' as PlanTier, name: 'Completo', price: COMPLETO_MONTHLY_PRICE, features: COMPLETO_FEATURES },
          ]
        ).map((plan) => {
          const isCurrent = subscription?.planTier === plan.tier
          return (
            <div
              key={plan.tier}
              className={`card ${plan.tier === 'completo' ? 'border-2 border-primary-500' : ''}`}
            >
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-semibold text-gray-900 flex items-center gap-1.5">
                  {plan.tier === 'completo' && <Layers size={16} className="text-primary-600" />}
                  {plan.name}
                </h3>
                {isCurrent && <span className="badge bg-primary-100 text-primary-700">Plano atual</span>}
              </div>
              <p className="text-2xl font-bold text-gray-900 mb-3">
                {formatCurrency(plan.price)}<span className="text-sm font-normal text-gray-500">/mês</span>
              </p>
              <div className="space-y-1.5 mb-4">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-center gap-2 text-sm text-gray-700">
                    <CheckCircle2 size={15} className="text-primary-500 flex-shrink-0" />
                    {feature}
                  </div>
                ))}
              </div>
              {subscription?.billingEnabled && subscription.status !== 'exempt' && !isCurrent && (
                <button
                  onClick={() => handleAssinar(plan.tier)}
                  className="btn-primary w-full"
                  disabled={startingCheckout}
                >
                  {startingCheckout ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <>
                      <CreditCard size={18} />
                      {plan.tier === 'completo' ? 'Fazer upgrade' : 'Assinar'}
                    </>
                  )}
                </button>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-gray-500 text-xs flex items-center gap-1.5">
        <Clock size={14} className="text-gray-400 flex-shrink-0" />
        Cobrança via cartão (checkout seguro da Stripe), sem contrato de fidelidade — cancelável quando
        quiser. Separada da comissão de {formatCurrency(1)} por pedido pago automaticamente pelo Mercado Pago
        no seu cardápio, que continua valendo do mesmo jeito.
      </p>

      <a
        href={`https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent('Olá! Tenho uma dúvida sobre a assinatura do CatalogAI.')}`}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-secondary inline-flex"
      >
        <MessageCircle size={18} />
        Falar no WhatsApp
      </a>

      {/* Doação */}
      <div className="card bg-gradient-to-br from-primary-50 to-white border-primary-100">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
            <Heart size={22} className="text-primary-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Gostou do sistema?</h2>
            <p className="text-gray-600 text-sm mb-4">
              Você tem 7 dias grátis com tudo liberado pra testar o sistema. Se ele está te ajudando a
              vender mais, uma doação (de qualquer valor) nos incentiva a continuar trazendo
              melhorias — e até outros sistemas — para você.
            </p>
            <button onClick={() => setShowDonateModal(true)} className="btn-primary">
              <Gift size={18} />
              Fazer uma doação
            </button>
          </div>
        </div>
      </div>

      {/* Modal de doação */}
      {showDonateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowDonateModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Doar via PIX</h2>
              <button onClick={() => setShowDonateModal(false)} className="p-1 hover:bg-gray-100 rounded" aria-label="Fechar">
                <X size={20} />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Muito obrigado por considerar apoiar o projeto! A chave PIX é um número de celular:
            </p>

            <div className="bg-gray-50 rounded-lg p-4 text-center mb-4">
              <p className="text-xs text-gray-500 mb-1">Chave PIX (celular)</p>
              <p className="text-xl font-bold text-gray-900">{PIX_PHONE_DISPLAY}</p>
            </div>

            <button onClick={handleCopyPix} className="btn-secondary w-full mb-2">
              <Copy size={16} />
              {copied ? 'Chave copiada!' : 'Copiar chave PIX'}
            </button>

            <p className="text-xs text-gray-400 text-center">
              Abra o app do seu banco, escolha &quot;Pix&quot; → &quot;Chave celular&quot; e cole a chave copiada.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
