'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { log, logError } from '@/lib/logger'
import type { BusinessType } from '@/types'
import {
  ChefHat, Package, Layers, Bike, Store as StoreIcon,
  Loader2, ArrowRight, ArrowLeft, CheckCircle2,
} from 'lucide-react'

const BUSINESS_TYPES: { value: BusinessType; title: string; description: string; icon: any }[] = [
  {
    value: 'preparo',
    title: 'Tem preparo',
    description: 'Comida, lanches, bebidas montadas na hora — precisa de cozinha ou montagem antes de sair.',
    icon: ChefHat,
  },
  {
    value: 'pronto',
    title: 'Já é pronto',
    description: 'Produto pronto pra vender: mercado, loja de roupa, adega, papelaria...',
    icon: Package,
  },
  {
    value: 'hibrido',
    title: 'Um pouco dos dois',
    description: 'Vende produtos prontos e também itens que precisam de preparo.',
    icon: Layers,
  },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState(1)
  const [businessType, setBusinessType] = useState<BusinessType>('preparo')
  const [offersDelivery, setOffersDelivery] = useState(true)
  const [offersPickup, setOffersPickup] = useState(true)
  const [themeColor, setThemeColor] = useState('#22c55e')

  useEffect(() => {
    checkExisting()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const checkExisting = async () => {
    log('onboarding', 'verificando estabelecimento...')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: est, error } = await supabase
        .from('establishments')
        .select('id, onboarding_completed, theme_color')
        .eq('owner_id', user.id)
        .maybeSingle()

      if (error) logError('onboarding', 'erro ao buscar estabelecimento', error)

      if (!est) {
        router.push('/completar-cadastro')
        return
      }
      if (est.onboarding_completed) {
        router.push('/painel')
        return
      }
      if (est.theme_color) setThemeColor(est.theme_color)
    } catch (err) {
      logError('onboarding', 'exceção ao verificar estabelecimento', err)
    } finally {
      setChecking(false)
    }
  }

  const finishOnboarding = async (overrides: Partial<{
    business_type: BusinessType
    offers_delivery: boolean
    offers_pickup: boolean
    theme_color: string
  }> = {}) => {
    setSaving(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const finalBusinessType = overrides.business_type ?? businessType
      const finalOffersDelivery = overrides.offers_delivery ?? offersDelivery
      const finalOffersPickup = overrides.offers_pickup ?? offersPickup
      const finalThemeColor = overrides.theme_color ?? themeColor

      const { error } = await supabase
        .from('establishments')
        .update({
          business_type: finalBusinessType,
          // Quem vende produto pronto normalmente não precisa do Kanban
          // completo com etapa de preparo — mas continua podendo ligar
          // isso depois em Configurações, a qualquer momento.
          order_tracking_enabled: finalBusinessType !== 'pronto',
          offers_delivery: finalOffersDelivery,
          offers_pickup: finalOffersPickup,
          theme_color: finalThemeColor,
          onboarding_completed: true,
        })
        .eq('owner_id', user.id)

      if (error) throw error
      log('onboarding', 'onboarding concluído')
      router.push('/painel')
      router.refresh()
    } catch (err: any) {
      logError('onboarding', 'erro ao salvar onboarding', err)
      alert('Não foi possível salvar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSkip = () => {
    // Defaults sensatos pra quem só quer chegar logo no painel — tudo
    // isso pode ser mudado depois em Configurações sem perda nenhuma.
    finishOnboarding({ business_type: 'preparo', offers_delivery: true, offers_pickup: true, theme_color: '#22c55e' })
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-white to-blue-50">
        <Loader2 size={32} className="animate-spin text-primary-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-blue-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 bg-primary-500 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-lg">C</span>
            </div>
            <span className="font-bold text-2xl text-gray-900">Cardápio<span className="text-primary-500">SaaS</span></span>
          </Link>
        </div>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className={`h-1.5 w-10 rounded-full ${s <= step ? 'bg-primary-500' : 'bg-gray-200'}`} />
            ))}
          </div>
          <button onClick={handleSkip} disabled={saving} className="text-sm text-gray-500 hover:text-gray-700">
            Pular por enquanto
          </button>
        </div>

        <div className="card">
          {step === 1 && (
            <>
              <h1 className="text-xl font-bold text-gray-900 mb-1">Como funcionam seus produtos?</h1>
              <p className="text-gray-600 text-sm mb-5">
                Isso ajusta o painel de pedidos automaticamente — sem preparo, você não precisa de
                etapas extras de "confirmado" e "em preparo".
              </p>
              <div className="space-y-3">
                {BUSINESS_TYPES.map((type) => (
                  <button
                    key={type.value}
                    onClick={() => setBusinessType(type.value)}
                    className={`w-full text-left flex items-start gap-3 p-4 rounded-lg border-2 transition-colors ${
                      businessType === type.value ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <type.icon size={22} className={businessType === type.value ? 'text-primary-600' : 'text-gray-400'} />
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{type.title}</p>
                      <p className="text-sm text-gray-500">{type.description}</p>
                    </div>
                    {businessType === type.value && <CheckCircle2 size={20} className="text-primary-500 flex-shrink-0" />}
                  </button>
                ))}
              </div>
              <button onClick={() => setStep(2)} className="btn-primary w-full mt-6">
                Próximo <ArrowRight size={18} />
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="text-xl font-bold text-gray-900 mb-1">Como o cliente recebe o pedido?</h1>
              <p className="text-gray-600 text-sm mb-5">Pode marcar as duas opções — dá pra mudar isso depois.</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setOffersDelivery(!offersDelivery)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${
                    offersDelivery ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500'
                  }`}
                >
                  <Bike size={24} />
                  <span className="text-sm font-medium">Entrega</span>
                </button>
                <button
                  onClick={() => setOffersPickup(!offersPickup)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${
                    offersPickup ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500'
                  }`}
                >
                  <StoreIcon size={24} />
                  <span className="text-sm font-medium">Retirada no local</span>
                </button>
              </div>
              {!offersDelivery && !offersPickup && (
                <p className="text-sm text-red-500 mt-3">Escolha pelo menos uma opção.</p>
              )}
              <div className="flex gap-3 mt-6">
                <button onClick={() => setStep(1)} className="btn-secondary flex-1">
                  <ArrowLeft size={18} /> Voltar
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!offersDelivery && !offersPickup}
                  className="btn-primary flex-1"
                >
                  Próximo <ArrowRight size={18} />
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h1 className="text-xl font-bold text-gray-900 mb-1">Qual a cor da sua marca?</h1>
              <p className="text-gray-600 text-sm mb-5">
                Essa cor aparece no seu cardápio, nos botões e destaques. Dá pra trocar quando quiser em Configurações.
              </p>
              <div className="flex items-center gap-3 mb-5">
                <input
                  type="color"
                  className="w-14 h-14 rounded-lg cursor-pointer border"
                  value={themeColor}
                  onChange={(e) => setThemeColor(e.target.value)}
                />
                <div>
                  <p className="text-sm text-gray-500">{themeColor}</p>
                  <p className="text-xs text-gray-400">Toque para escolher outra cor</p>
                </div>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg mb-6">
                <p className="text-xs text-gray-500 mb-2">Prévia</p>
                <button
                  type="button"
                  className="px-5 py-2.5 rounded-lg text-white font-medium text-sm"
                  style={{ backgroundColor: themeColor }}
                >
                  Adicionar ao carrinho
                </button>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(2)} className="btn-secondary flex-1" disabled={saving}>
                  <ArrowLeft size={18} /> Voltar
                </button>
                <button onClick={() => finishOnboarding()} className="btn-primary flex-1" disabled={saving}>
                  {saving ? <Loader2 size={18} className="animate-spin" /> : 'Concluir e ir para o painel'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
