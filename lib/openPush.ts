import type { SupabaseClient } from '@supabase/supabase-js'
import { DAY_KEYS, dayRange, getStoreAvailability, localDayAndMinutes, type OpeningHours } from '@/lib/hours'
import { buildOpenPushMessage } from '@/lib/openPushMessage'
import { resolveTargets, sendToTargets } from '@/lib/customerPush'
import { logError } from '@/lib/logger'

// Aviso automático "a loja abriu" (migration 051). Roda no servidor: no
// agendador de minuto em minuto e quando o lojista abre a loja/o painel.
// Uma vez por dia por loja, garantido pelo banco (UPDATE condicional).

export const OPEN_PUSH_COLUMNS =
  'id, name, slug, logo_url, timezone, is_open, paused_until, opening_hours, opened_at, inactive_customer_days, open_push_enabled, open_push_mode, open_push_title, open_push_body, open_push_product_id, open_push_last_sent_at'

export interface OpenPushStoreRow {
  id: string
  name: string
  slug: string
  logo_url: string | null
  timezone: string | null
  is_open: boolean | null
  paused_until: string | null
  opening_hours: OpeningHours | null
  opened_at: string | null
  inactive_customer_days: number | null
  open_push_enabled: boolean
  open_push_mode: 'auto' | 'custom' | null
  open_push_title: string | null
  open_push_body: string | null
  open_push_product_id: string | null
  open_push_last_sent_at: string | null
}

// Até quantos minutos depois da abertura o aviso ainda vale.
export const OPEN_WINDOW_MINUTES = 45
// Nunca manda de madrugada (loja 24h, ou que abre 00:00).
const QUIET_UNTIL_MINUTES = 7 * 60

/** A loja acabou de abrir (pelo horário ou pelo botão "Aberta")? */
export function isOpeningMoment(store: Pick<OpenPushStoreRow, 'is_open' | 'paused_until' | 'opening_hours' | 'timezone' | 'opened_at'>, now = new Date()): boolean {
  const timeZone = store.timezone || 'America/Sao_Paulo'
  const availability = getStoreAvailability({ isOpen: store.is_open ?? true, pausedUntil: store.paused_until, openingHours: store.opening_hours, timeZone }, now)
  if (!availability.open) return false
  const { dayIndex, minutes } = localDayAndMinutes(now, timeZone)
  if (minutes < QUIET_UNTIL_MINUTES) return false

  if (store.opened_at && now.getTime() - new Date(store.opened_at).getTime() <= OPEN_WINDOW_MINUTES * 60_000) return true
  const today = dayRange(store.opening_hours, DAY_KEYS[dayIndex])
  if (!today || today.open < QUIET_UNTIL_MINUTES) return false
  const since = minutes - today.open
  return since >= 0 && since <= OPEN_WINDOW_MINUTES
}

function localDayStart(now: Date, timeZone: string): Date {
  const { minutes } = localDayAndMinutes(now, timeZone)
  const d = new Date(now.getTime() - minutes * 60_000)
  d.setUTCSeconds(0, 0)
  return d
}

export async function maybeSendOpenPush(
  admin: SupabaseClient,
  store: OpenPushStoreRow,
  now = new Date()
): Promise<{ sent: number; reason?: string }> {
  if (!store.open_push_enabled) return { sent: 0, reason: 'desligado' }
  if (!isOpeningMoment(store, now)) return { sent: 0, reason: 'fora da abertura' }
  const timeZone = store.timezone || 'America/Sao_Paulo'
  const dayStart = localDayStart(now, timeZone).toISOString()

  // Reserva o envio de hoje: só uma execução consegue (agendador e painel
  // podem chegar juntos).
  const { data: claimed } = await admin
    .from('establishments')
    .update({ open_push_last_sent_at: now.toISOString() })
    .eq('id', store.id)
    .eq('open_push_enabled', true)
    .or(`open_push_last_sent_at.is.null,open_push_last_sent_at.lt."${dayStart}"`)
    .select('id')
  if (!claimed || claimed.length === 0) return { sent: 0, reason: 'já enviado hoje' }

  try {
    const { data: products } = await admin
      .from('products')
      .select('id, name, price, image_url, sold_out_until')
      .eq('establishment_id', store.id)
      .eq('is_active', true)
      .limit(300)
    const available = (products || []).filter((p) => !p.sold_out_until || new Date(p.sold_out_until).getTime() < now.getTime())
    const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone }).format(now)
    const message = buildOpenPushMessage(store, available, dayKey, store.open_push_product_id)

    const targets = await resolveTargets(admin, store, 'all')
    if (targets.length === 0) return { sent: 0, reason: 'nenhum aparelho com avisos' }

    const url = message.productId ? `/loja/${store.slug}?produto=${message.productId}` : `/loja/${store.slug}`
    const { data: campaign, error } = await admin
      .from('push_campaigns')
      .insert({
        establishment_id: store.id, title: message.title, body: message.body, image_url: message.image, url,
        audience: 'all', source: 'abertura', target_count: targets.length,
      })
      .select('id')
      .single()
    if (error) throw error
    const result = await sendToTargets(admin, targets, {
      title: message.title, body: message.body, url, icon: store.logo_url, image: message.image,
      campaignId: campaign.id, tag: `abertura-${store.id}`,
    })
    await admin.from('push_campaigns').update({ sent_count: result.sent, failed_count: result.failed }).eq('id', campaign.id)
    return { sent: result.sent }
  } catch (err) {
    logError('push:abertura', 'erro ao enviar aviso de loja aberta', err, store.id)
    return { sent: 0, reason: 'erro' }
  }
}

/** Agendador: confere todas as lojas com o aviso ligado. */
export async function runOpenPushes(admin: SupabaseClient, now = new Date()): Promise<number> {
  const { data: stores, error } = await admin.from('establishments').select(OPEN_PUSH_COLUMNS).eq('open_push_enabled', true).limit(5000)
  if (error) {
    logError('push:abertura', 'erro ao listar lojas com aviso de abertura', error)
    return 0
  }
  let sent = 0
  for (const store of (stores || []) as unknown as OpenPushStoreRow[]) {
    if (!isOpeningMoment(store, now)) continue
    const r = await maybeSendOpenPush(admin, store, now)
    sent += r.sent
  }
  return sent
}
