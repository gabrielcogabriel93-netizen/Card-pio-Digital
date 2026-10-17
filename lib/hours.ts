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

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo'

// Dia da semana e minuto do dia no fuso da LOJA, não no do aparelho do
// cliente -- senão quem abre o cardápio de outro estado (ou com o relógio
// errado) vê "aberto"/"fechado" trocado. Espelha establishment_is_open_now
// no banco (migration 045), que é quem decide de verdade no pedido.
export function localDayAndMinutes(now: Date, timeZone = DEFAULT_TIMEZONE): { dayIndex: number; minutes: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now)
    const get = (type: string) => parts.find((p) => p.type === type)?.value || ''
    const dayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))
    const minutes = Number(get('hour')) * 60 + Number(get('minute'))
    if (dayIndex < 0 || Number.isNaN(minutes)) throw new Error('fuso inválido')
    return { dayIndex, minutes }
  } catch {
    return { dayIndex: now.getDay(), minutes: now.getHours() * 60 + now.getMinutes() }
  }
}

function parseHHMM(value: string): number | null {
  const [h, m] = value.split(':').map(Number)
  if ([h, m].some((n) => Number.isNaN(n))) return null
  return h * 60 + m
}

function dayRange(openingHours: OpeningHours | undefined | null, dayKey: string): { open: number; close: number } | null {
  const hours = openingHours?.[dayKey]
  if (!hours || !hours.open || !hours.close) return null
  const open = parseHHMM(hours.open)
  const close = parseHHMM(hours.close)
  if (open === null || close === null) return null
  return { open, close }
}

/**
 * Confere se o horário atual está dentro do horário de funcionamento
 * configurado. Se não houver horário configurado para o dia (ou nenhum
 * horário configurado), não bloqueia — retorna true (deixa o toggle manual
 * decidir sozinho).
 */
export function isWithinOpeningHours(
  openingHours: OpeningHours | undefined | null,
  now = new Date(),
  timeZone: string = DEFAULT_TIMEZONE
): boolean {
  if (!openingHours) return true

  const { dayIndex, minutes } = localDayAndMinutes(now, timeZone)
  const range = dayRange(openingHours, DAY_KEYS[dayIndex])
  if (!range) {
    // Ainda pode estar no "rabo" do horário de ontem que atravessa a meia-noite.
    return true
  }

  if (range.close <= range.open) {
    return minutes >= range.open || minutes < range.close
  }
  return minutes >= range.open && minutes < range.close
}

export interface StoreAvailability {
  open: boolean
  // "Fecha às 23:00" quando aberta; "Abre hoje às 18:00" / "Abre amanhã
  // às 18:00" / "Abre sexta às 18:00" quando fechada. null se não houver
  // horário configurado para dizer.
  label: string | null
}

/**
 * Situação da loja pronta para exibir no topo do cardápio: aberta ou
 * fechada, e quando muda. Considera chave manual e pausa temporária.
 */
export function getStoreAvailability(
  params: { isOpen?: boolean; pausedUntil?: string | null; openingHours?: OpeningHours | null; timeZone?: string | null },
  now = new Date()
): StoreAvailability {
  const timeZone = params.timeZone || DEFAULT_TIMEZONE
  const paused = !!params.pausedUntil && new Date(params.pausedUntil).getTime() > now.getTime()
  const manualOpen = params.isOpen ?? true
  const withinHours = isWithinOpeningHours(params.openingHours, now, timeZone)
  const open = manualOpen && !paused && withinHours

  if (paused && manualOpen) {
    const until = new Date(params.pausedUntil!)
    const hhmm = new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit' }).format(until)
    return { open: false, label: `Pausada, volta às ${hhmm}` }
  }

  const { dayIndex, minutes } = localDayAndMinutes(now, timeZone)
  if (open) {
    const today = dayRange(params.openingHours, DAY_KEYS[dayIndex])
    if (today) return { open: true, label: `Aberto até ${formatMinutes(today.close)}` }
    return { open: true, label: null }
  }

  if (!manualOpen && !params.openingHours) return { open: false, label: null }

  // Procura a próxima abertura nos próximos 7 dias.
  for (let offset = 0; offset < 7; offset++) {
    const idx = (dayIndex + offset) % 7
    const range = dayRange(params.openingHours, DAY_KEYS[idx])
    if (!range) continue
    if (offset === 0 && range.open <= minutes) continue
    const when = offset === 0 ? 'hoje' : offset === 1 ? 'amanhã' : DAY_LABELS[DAY_KEYS[idx]].split('-')[0].toLowerCase()
    return { open: false, label: `Abre ${when} às ${formatMinutes(range.open)}` }
  }
  return { open: false, label: null }
}

function formatMinutes(total: number): string {
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export interface WeeklyHoursRow {
  key: string
  label: string
  isToday: boolean
  hours: { open: string; close: string } | null
}

/**
 * Lista os 7 dias da semana com o horário configurado em cada um, para
 * o drawer "Sobre a loja" do cardápio público. Dia sem horário
 * configurado vem com `hours: null` (exibido como "Fechado" na UI).
 */
export function getWeeklyHours(
  openingHours: OpeningHours | undefined | null,
  now = new Date(),
  timeZone: string = DEFAULT_TIMEZONE
): WeeklyHoursRow[] {
  const todayIndex = localDayAndMinutes(now, timeZone).dayIndex

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
