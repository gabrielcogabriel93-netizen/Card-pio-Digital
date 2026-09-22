'use client'

import { createContext, useContext } from 'react'
import type { PlanTier } from '@/lib/plans'

export interface SubscriptionContextValue {
  planTier: PlanTier
  // true também durante trial/isenção/cobrança desligada -- espelha
  // establishment_has_completo_access no banco (migration 041). Único
  // valor que as páginas gated devem checar, nunca planTier sozinho.
  hasCompletoAccess: boolean
  monthlyPrice: number
}

// Provido por app/painel/layout.tsx, que já busca get_my_subscription_status
// a cada carregamento do painel -- evita cada página gated (Balcão,
// Fidelidade, Cupons, Mesas, Relatórios, seção de estoque em Produtos)
// duplicar essa mesma chamada RPC.
const SubscriptionContext = createContext<SubscriptionContextValue | null>(null)

export function SubscriptionProvider({ value, children }: { value: SubscriptionContextValue; children: React.ReactNode }) {
  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>
}

// Fallback liberado (hasCompletoAccess: true) quando usado fora do
// provider -- nunca deve acontecer dentro de /painel, mas evita
// travar tudo por engano se alguma página gated for renderizada num
// contexto de teste sem o layout.
export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext)
  return ctx ?? { planTier: 'completo', hasCompletoAccess: true, monthlyPrice: 49.9 }
}
