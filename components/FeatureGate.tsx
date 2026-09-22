'use client'

import Link from 'next/link'
import { Lock } from 'lucide-react'

// Paywall simples pra feature do plano Completo -- nunca esconde o
// menu sem explicação (pedido explícito): a página continua alcançável
// pela nav, só o CONTEÚDO vira este aviso + botão de upgrade em vez do
// que a página realmente faz.
export function FeatureGate({ featureName, description }: { featureName: string; description?: string }) {
  return (
    <div className="card text-center py-16 max-w-lg mx-auto">
      <div className="w-14 h-14 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-4">
        <Lock size={24} className="text-primary-600" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 mb-2">Disponível no plano Completo</h2>
      <p className="text-gray-600 text-sm mb-6">
        {featureName} faz parte do plano Completo.
        {description ? ` ${description}` : ''}
      </p>
      <Link href="/painel/planos" className="btn-primary inline-flex">
        Ver planos
      </Link>
    </div>
  )
}

// Versão menor, pra travar só uma SEÇÃO dentro de uma página que
// continua liberada no Essencial (ex: campos de estoque dentro do
// cadastro de produto) -- em vez de bloquear a página toda.
export function FeatureGateInline({ featureName }: { featureName: string }) {
  return (
    <div className="bg-primary-50 border border-primary-100 rounded-lg p-3 flex items-center gap-3">
      <Lock size={16} className="text-primary-600 flex-shrink-0" />
      <p className="text-sm text-primary-800">
        {featureName} disponível no{' '}
        <Link href="/painel/planos" className="font-medium underline">
          plano Completo
        </Link>
        .
      </p>
    </div>
  )
}
