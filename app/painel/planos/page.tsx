'use client'

import { useState } from 'react'
import { Heart, CheckCircle2, Copy, X, Gift, Sparkles } from 'lucide-react'

// Chave PIX (telefone) para doações. Formato E.164 (+55 + DDD + número) —
// é o que a maioria dos apps de banco espera ao colar uma chave "celular".
const PIX_PHONE_DISPLAY = '(21) 97265-2314'
const PIX_PHONE_KEY = '+5521972652314'

const INCLUDED_FEATURES = [
  'Cardápio digital ilimitado, com fotos e variações',
  'Pedidos via WhatsApp, com link de acompanhamento',
  'Painel de pedidos, balcão/PDV e financeiro',
  'Cupons de desconto e controle de estoque',
  'Cor de marca personalizada no cardápio',
]

export default function PlanosPage() {
  const [showDonateModal, setShowDonateModal] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopyPix = () => {
    navigator.clipboard.writeText(PIX_PHONE_KEY)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Planos</h1>
        <p className="text-gray-600 mt-1">Sua assinatura e como apoiar o projeto.</p>
      </div>

      {/* Plano atual */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-primary-500" />
            <h2 className="text-lg font-semibold text-gray-900">Seu plano</h2>
          </div>
          <span className="badge bg-primary-100 text-primary-700">Gratuito</span>
        </div>

        <p className="text-gray-600 text-sm mb-4">
          Este sistema está 100% gratuito no momento — sem taxas, sem limite de produtos e sem
          cartão de crédito. Todas as funcionalidades abaixo já estão liberadas para você.
        </p>

        <div className="space-y-2">
          {INCLUDED_FEATURES.map((feature) => (
            <div key={feature} className="flex items-center gap-2 text-sm text-gray-700">
              <CheckCircle2 size={16} className="text-primary-500 flex-shrink-0" />
              {feature}
            </div>
          ))}
        </div>
      </div>

      {/* Doação */}
      <div className="card bg-gradient-to-br from-primary-50 to-white border-primary-100">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
            <Heart size={22} className="text-primary-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Gostou do sistema?</h2>
            <p className="text-gray-600 text-sm mb-4">
              Esse sistema está de forma totalmente gratuita no momento. Se ele está te ajudando a
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
              Abra o app do seu banco, escolha "Pix" → "Chave celular" e cole a chave copiada.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
