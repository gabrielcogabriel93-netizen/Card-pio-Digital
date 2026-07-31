// Espelho em TypeScript da função get_my_subscription_status() (migration
// 032) — usado só pelo dashboard /admin, que já lê establishments direto
// via service role e precisa mostrar o mesmo "bloqueado ou não" que o
// painel do lojista calcula no banco. Nunca usado pra decidir o bloqueio
// de verdade: quem manda nisso é sempre a RPC (o cliente não pode
// calcular a própria liberação).
export type SubscriptionStatus = 'trial' | 'active' | 'exempt'

export interface SubscriptionState {
  billingEnabled: boolean
  status: SubscriptionStatus | string
  trialEndsAt: string | null
  currentPeriodEnd: string | null
}

export type SubscriptionReason =
  | 'billing_disabled'
  | 'exempt'
  | 'trial_active'
  | 'trial_expired'
  | 'subscription_active'
  | 'subscription_expired'

export interface SubscriptionResult {
  blocked: boolean
  reason: SubscriptionReason
}

export function resolveSubscriptionAccess(state: SubscriptionState, now: Date = new Date()): SubscriptionResult {
  if (!state.billingEnabled) return { blocked: false, reason: 'billing_disabled' }
  if (state.status === 'exempt') return { blocked: false, reason: 'exempt' }

  if (state.status === 'active') {
    const expired = !!state.currentPeriodEnd && new Date(state.currentPeriodEnd) < now
    return { blocked: expired, reason: expired ? 'subscription_expired' : 'subscription_active' }
  }

  // 'trial' (ou qualquer status desconhecido): sem prazo definido = livre.
  const trialExpired = !!state.trialEndsAt && new Date(state.trialEndsAt) < now
  return { blocked: trialExpired, reason: trialExpired ? 'trial_expired' : 'trial_active' }
}
