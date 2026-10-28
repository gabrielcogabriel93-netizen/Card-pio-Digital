// Avisos para o DONO da plataforma (só os e-mails de PLATFORM_ADMIN_EMAILS
// registram aparelho). Os gatilhos no banco (migration 057) criam as
// linhas em owner_alerts; o cron de cada minuto manda o push aqui.
import type { SupabaseClient } from '@supabase/supabase-js'
import { getWebPush } from './webpush'
import { isPlatformAdminEmail } from './platformAdmin'
import { logWarning } from './logger'

export async function addOwnerAlert(admin: SupabaseClient, alert: { kind: string; title: string; body?: string | null; url?: string | null; dedupe?: string | null }) {
  await admin.rpc('add_owner_alert', {
    p_kind: alert.kind,
    p_title: alert.title,
    p_body: alert.body || null,
    p_url: alert.url || '/admin/crescimento',
    p_dedupe: alert.dedupe || null,
  })
}

/** Manda por push os avisos ainda não enviados (até 20 por minuto). */
export async function flushOwnerAlerts(admin: SupabaseClient): Promise<number> {
  const { data: alerts } = await admin
    .from('owner_alerts')
    .select('id, kind, title, body, url')
    .is('sent_at', null)
    .gte('created_at', new Date(Date.now() - 24 * 3_600_000).toISOString())
    .order('created_at')
    .limit(20)
  if (!alerts?.length) return 0

  const { data: subs } = await admin.from('owner_push_subscriptions').select('endpoint, p256dh, auth, user_email')
  // Só aparelhos de quem ainda é dono (tirou o e-mail da Vercel = para de receber).
  const devices = (subs || []).filter((s) => isPlatformAdminEmail(s.user_email))

  if (devices.length) {
    let webpush
    try {
      webpush = getWebPush()
    } catch (err) {
      logWarning('owner-alerts', 'push sem chaves VAPID', err)
      return 0
    }
    for (const alert of alerts) {
      const payload = JSON.stringify({ title: alert.title, body: alert.body || '', url: alert.url || '/admin/crescimento', tag: `owner-${alert.id}` })
      for (const d of devices) {
        try {
          await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, payload, { TTL: 86_400 })
          await admin.from('owner_push_subscriptions').update({ last_ok_at: new Date().toISOString() }).eq('endpoint', d.endpoint)
        } catch (err: any) {
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await admin.from('owner_push_subscriptions').delete().eq('endpoint', d.endpoint)
          } else {
            logWarning('owner-alerts', 'falha ao enviar aviso ao dono', err?.message || err)
          }
        }
      }
    }
  }
  // Sem aparelho cadastrado o aviso fica só na lista do admin.
  await admin.from('owner_alerts').update({ sent_at: new Date().toISOString() }).in('id', alerts.map((a) => a.id))
  return alerts.length
}

const spParts = (d: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value || ''
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) }
}

/** Resumo do dia às 9h (horário de Brasília), uma vez por dia. */
export async function runDailyDigest(admin: SupabaseClient, now = new Date()): Promise<boolean> {
  const { day, hour } = spParts(now)
  if (hour < 9) return false
  const { data: exists } = await admin.from('owner_alerts').select('id').eq('dedupe_key', `resumo:${day}`).maybeSingle()
  if (exists) return false

  const since = new Date(now.getTime() - 24 * 3_600_000).toISOString()
  const in3d = new Date(now.getTime() + 3 * 86_400_000).toISOString()
  const [leads, stores, orders, tickets, trials] = await Promise.all([
    admin.from('growth_leads').select('id', { count: 'exact', head: true }).gte('created_at', since).is('establishment_id', null),
    admin.from('establishments').select('id', { count: 'exact', head: true }).gte('created_at', since),
    admin.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', since).neq('status', 'cancelled'),
    admin.from('support_tickets').select('id', { count: 'exact', head: true }).neq('status', 'resolvido'),
    admin.from('establishments').select('id', { count: 'exact', head: true }).eq('subscription_status', 'trial').gt('trial_ends_at', now.toISOString()).lte('trial_ends_at', in3d),
  ])
  const parts = [
    `${stores.count || 0} loja(s) nova(s)`,
    `${leads.count || 0} cadastro(s) parado(s) no meio`,
    `${orders.count || 0} pedido(s) na plataforma`,
  ]
  if (trials.count) parts.push(`${trials.count} teste(s) terminam em até 3 dias`)
  if (tickets.count) parts.push(`${tickets.count} chamado(s) em aberto`)
  await addOwnerAlert(admin, { kind: 'resumo', title: 'Resumo das últimas 24h', body: parts.join(' · '), url: '/admin/crescimento', dedupe: `resumo:${day}` })
  return true
}
