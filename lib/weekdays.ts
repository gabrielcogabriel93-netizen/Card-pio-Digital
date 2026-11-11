// Dias da semana dos pratos (migration 060): 0 = domingo ... 6 = sábado.

export const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
export const WEEKDAY_LONG = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

/** Dia da semana agora no fuso da loja. */
export function weekdayIn(timeZone: string | null | undefined, now = new Date()): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: timeZone || 'America/Sao_Paulo', weekday: 'short' }).format(now)
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name)
}

/** "sábado", "seg, qua e sex", "seg a sex". */
export function weekdaysLabel(days: number[] | null | undefined): string {
  const d = Array.from(new Set(days || [])).filter((x) => x >= 0 && x <= 6).sort((a, b) => a - b)
  if (d.length === 0 || d.length === 7) return 'todos os dias'
  if (d.length === 1) return WEEKDAY_LONG[d[0]]
  if (d.join() === '1,2,3,4,5') return 'seg a sex'
  if (d.join() === '0,6') return 'fins de semana'
  const names = d.map((x) => WEEKDAY_SHORT[x])
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`
}

/** Prato servido hoje? (vazio = todos os dias) */
export function servedToday(days: number[] | null | undefined, timeZone?: string | null, now = new Date()): boolean {
  return !days || days.length === 0 || days.includes(weekdayIn(timeZone, now))
}
