// "Acabou hoje": esgotado até a meia-noite de Brasília e volta sozinho no
// dia seguinte (produtos desde a migration 044; opções desde a 060).

export function endOfTodayIso(timeZone = 'America/Sao_Paulo', now = new Date()): string {
  const local = new Date(now.toLocaleString('en-US', { timeZone }))
  const offsetMs = now.getTime() - local.getTime()
  const midnight = new Date(local.getFullYear(), local.getMonth(), local.getDate() + 1, 0, 0, 0)
  return new Date(midnight.getTime() + offsetMs).toISOString()
}

export function isSoldOut(until: string | null | undefined, now = new Date()): boolean {
  return !!until && new Date(until) > now
}
