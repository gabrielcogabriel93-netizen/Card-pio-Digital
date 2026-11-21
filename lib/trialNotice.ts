// Aviso de fim do teste grátis no topo do painel: nos últimos 7 dias, para a
// loja não parar de receber pedidos de surpresa quando o teste vence.
export interface TrialNotice {
  daysLeft: number
  endsAt: string
}

export function trialNotice(row: { status?: string | null; trial_ends_at?: string | null; billing_enabled?: boolean | null; blocked?: boolean | null } | null | undefined, now = new Date()): TrialNotice | null {
  if (!row || !row.billing_enabled || row.blocked || row.status !== 'trial' || !row.trial_ends_at) return null
  const ms = new Date(row.trial_ends_at).getTime() - now.getTime()
  if (ms <= 0 || ms > 7 * 86_400_000) return null
  return { daysLeft: Math.max(1, Math.ceil(ms / 86_400_000)), endsAt: row.trial_ends_at }
}

export function trialNoticeText(n: TrialNotice, timeZone = 'America/Sao_Paulo'): string {
  const date = new Date(n.endsAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone })
  const when = n.daysLeft === 1 ? 'termina amanhã' : `termina em ${n.daysLeft} dias`
  return `Seu teste grátis ${when} (${date}). Assine para a loja continuar recebendo pedidos sem interrupção.`
}
