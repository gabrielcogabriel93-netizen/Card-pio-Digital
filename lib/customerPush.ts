import type { SupabaseClient } from '@supabase/supabase-js'
import { getWebPush } from '@/lib/webpush'
import { logError } from '@/lib/logger'

// Notificações da LOJA para os clientes dela (no lugar do WhatsApp). Só
// roda no servidor: usa a chave privada do VAPID e a service role.

import type { Audience } from '@/lib/pushAudience'
export { AUDIENCE_LABELS, type Audience } from '@/lib/pushAudience'

export interface PushTarget {
  id?: string
  endpoint: string
  p256dh: string
  auth: string
}

export interface PushPayload {
  title: string
  body: string
  url: string
  icon?: string | null
  image?: string | null
  tag?: string
  campaignId?: string
}

const digits = (s: string | null | undefined) => (s || '').replace(/\D/g, '')

/** Manda para cada aparelho; endereço que não existe mais (404/410) é desligado. */
export async function sendToTargets(admin: SupabaseClient, targets: PushTarget[], payload: PushPayload) {
  const webpush = getWebPush()
  const body = JSON.stringify({ ...payload, icon: payload.icon || undefined, image: payload.image || undefined })
  let sent = 0
  let failed = 0
  const stale: string[] = []
  const seen = new Set<string>()

  await Promise.all(
    targets.map(async (t) => {
      if (seen.has(t.endpoint)) return
      seen.add(t.endpoint)
      try {
        await webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, body, { TTL: 60 * 60 * 24 })
        sent++
      } catch (err: any) {
        failed++
        if (err?.statusCode === 404 || err?.statusCode === 410) stale.push(t.endpoint)
        else logError('push:cliente', 'erro ao enviar notificação', err)
      }
    })
  )

  if (stale.length > 0) {
    await admin
      .from('customer_devices')
      .update({ notifications_enabled: false, endpoint: null, p256dh: null, auth: null })
      .in('endpoint', stale)
  }
  return { sent, failed, removed: stale.length, staleEndpoints: stale }
}

/** Telefones (só dígitos) do público escolhido; null = todos os aparelhos. */
async function phonesFor(
  admin: SupabaseClient,
  est: { id: string; timezone?: string | null; inactive_customer_days?: number | null },
  audience: Audience,
  value?: string | null
): Promise<Set<string> | null> {
  if (audience === 'all') return null
  if (audience === 'customer') return new Set([digits(value)].filter((p) => p.length >= 10))

  if (audience === 'birthday') {
    const tz = est.timezone || 'America/Sao_Paulo'
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, month: '2-digit', day: '2-digit' }).format(new Date())
    const { data } = await admin.from('customers').select('phone, birth_date').eq('establishment_id', est.id).not('birth_date', 'is', null)
    return new Set((data || []).filter((c) => String(c.birth_date).slice(5, 10) === today).map((c) => digits(c.phone)))
  }

  // recent / inactive: pela data do último pedido do cliente.
  const days = audience === 'recent' ? 30 : Math.max(7, est.inactive_customer_days || 20)
  const cut = new Date(Date.now() - days * 86400e3).toISOString()
  let query = admin.from('customers').select('phone').eq('establishment_id', est.id).not('last_order_at', 'is', null)
  query = audience === 'recent' ? query.gte('last_order_at', cut) : query.lt('last_order_at', cut)
  const { data } = await query.limit(20000)
  return new Set((data || []).map((c) => digits(c.phone)))
}

/** Aparelhos com avisos ativos que fazem parte do público. */
export async function resolveTargets(
  admin: SupabaseClient,
  est: { id: string; timezone?: string | null; inactive_customer_days?: number | null },
  audience: Audience,
  value?: string | null
): Promise<PushTarget[]> {
  const phones = await phonesFor(admin, est, audience, value)
  if (phones && phones.size === 0) return []
  let query = admin
    .from('customer_devices')
    .select('id, endpoint, p256dh, auth, customer_phone')
    .eq('establishment_id', est.id)
    .eq('notifications_enabled', true)
    .not('endpoint', 'is', null)
  if (phones) query = query.in('customer_phone', Array.from(phones))
  const { data, error } = await query.limit(20000)
  if (error) throw error
  return (data || []).filter((d) => d.endpoint && d.p256dh && d.auth) as PushTarget[]
}

/** Aparelhos ligados a um telefone (avisos de pedido). */
export async function targetsForPhone(admin: SupabaseClient, establishmentId: string, phone: string): Promise<PushTarget[]> {
  const p = digits(phone)
  if (p.length < 10) return []
  const { data } = await admin
    .from('customer_devices')
    .select('id, endpoint, p256dh, auth')
    .eq('establishment_id', establishmentId)
    .eq('customer_phone', p)
    .eq('notifications_enabled', true)
    .not('endpoint', 'is', null)
  return (data || []).filter((d) => d.endpoint && d.p256dh && d.auth) as PushTarget[]
}
