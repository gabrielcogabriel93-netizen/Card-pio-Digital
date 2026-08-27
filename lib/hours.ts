export type OpeningHours = Record<string, { open: string; close: string }>

// Date.getDay(): 0 = domingo ... 6 = sábado
export const DAY_KEYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']

export const DAY_LABELS: Record<string, string> = {
  dom: 'Domingo',
  seg: 'Segunda-feira',
  ter: 'Terça-feira',
  qua: 'Quarta-feira',
  qui: 'Quinta-feira',
  sex: 'Sexta-feira',
  sab: 'Sábado',
}

/**
 * Confere se o horário atual está dentro do horário de funcionamento
 * configurado. Se não houver horário configurado para o dia (ou nenhum
 * horário configurado), não bloqueia — retorna true (deixa o toggle manual
 * decidir sozinho, como antes).
 */
export function isWithinOpeningHours(openingHours: OpeningHours | undefined | null, now = new Date()): boolean {
  if (!openingHours) return true

  const dayKey = DAY_KEYS[now.getDay()]
  const todayHours = openingHours[dayKey]
  if (!todayHours || !todayHours.open || !todayHours.close) return true

  const [openH, openM] = todayHours.open.split(':').map(Number)
  const [closeH, closeM] = todayHours.close.split(':').map(Number)
  if ([openH, openM, closeH, closeM].some((n) => Number.isNaN(n))) return true

  const minutesNow = now.getHours() * 60 + now.getMinutes()
  const openMinutes = openH * 60 + openM
  const closeMinutes = closeH * 60 + closeM

  // Horário atravessa a meia-noite (ex: 18:00–02:00)
  if (closeMinutes <= openMinutes) {
    return minutesNow >= openMinutes || minutesNow < closeMinutes
  }

  return minutesNow >= openMinutes && minutesNow < closeMinutes
}

export interface WeeklyHoursRow {
  key: string
  label: string
  isToday: boolean
  hours: { open: string; close: string } | null
}

/**
 * Lista os 7 dias da semana com o horário configurado em cada um, para
 * o drawer "Sobre a loja" do cardápio público — diferente de
 * `isWithinOpeningHours`, que só olha o dia de hoje pra decidir
 * aberto/fechado, aqui é a semana inteira. Dia sem horário configurado
 * vem com `hours: null` (exibido como "Fechado" na UI).
 */
export function getWeeklyHours(openingHours: OpeningHours | undefined | null, now = new Date()): WeeklyHoursRow[] {
  const todayIndex = now.getDay()

  return DAY_KEYS.map((key, index) => {
    const todayHours = openingHours?.[key]
    const hasValidHours = !!todayHours && !!todayHours.open && !!todayHours.close

    return {
      key,
      label: DAY_LABELS[key],
      isToday: index === todayIndex,
      hours: hasValidHours ? todayHours! : null,
    }
  })
}
