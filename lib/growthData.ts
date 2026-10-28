// Busca no banco (service role) tudo o que a aba Crescimento usa. Só é
// importado por rotas /api/admin/growth/**, que checam o acesso antes.
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from './salesReport'
import { COMPLETO_MONTHLY_PRICE } from './plans'
import {
  buildLeadRows, computeGrowthMetrics,
  type GMStore, type GMStats, type GMLead, type GMEvent, type GMActivity, type GMMonth, type GMSubEvent, type GMNps, type GMTicket, type GMSpend, type LeadRow,
} from './growthMetrics'

const DAY = 86_400_000

async function accountEmails(admin: SupabaseClient): Promise<Set<string>> {
  const emails = new Set<string>()
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) break
    for (const u of data.users) if (u.email) emails.add(u.email.toLowerCase())
    if (data.users.length < 1000) break
  }
  return emails
}

export async function loadLeadRows(admin: SupabaseClient, now = new Date()) {
  const [settings, stores, stats, leads, emails, paidEvents] = await Promise.all([
    admin.from('platform_settings').select('billing_enabled, monthly_price').eq('id', true).single(),
    fetchAllRows<GMStore>((f, t) => admin.from('establishments')
      .select('id, name, created_at, subscription_status, trial_ends_at, current_period_end, plan_tier, onboarding_completed, whatsapp_number').range(f, t)),
    admin.rpc('growth_store_stats'),
    fetchAllRows<GMLead>((f, t) => admin.from('growth_leads').select('*').order('created_at', { ascending: false }).range(f, t)),
    accountEmails(admin),
    fetchAllRows<{ establishment_id: string }>((f, t) => admin.from('subscription_events').select('establishment_id').eq('event', 'paid').range(f, t)),
  ])
  if (stats.error) throw stats.error
  const billingEnabled = !!settings.data?.billing_enabled
  const statRows = ((stats.data || []) as GMStats[]).map((s) => ({ ...s, sales_30d: Number(s.sales_30d) }))
  const rows = buildLeadRows({
    leads,
    stores,
    stats: statRows,
    accountEmails: emails,
    everPaid: new Set(paidEvents.map((p) => p.establishment_id).filter(Boolean)),
    billingEnabled,
    now,
  })
  return { rows, stores, stats: statRows, billingEnabled, essencialPrice: Number(settings.data?.monthly_price || 49.9) }
}

export async function loadGrowthMetrics(admin: SupabaseClient, periodDays: number, now = new Date()) {
  const start = new Date(now.getTime() - periodDays * DAY).toISOString()
  const since90 = new Date(now.getTime() - Math.max(periodDays, 90) * DAY).toISOString()
  const since31 = new Date(now.getTime() - 32 * DAY).toISOString().slice(0, 10)
  const since24h = new Date(now.getTime() - DAY).toISOString()

  const [base, events, activity, months, subEvents, nps, tickets, spend, ratings, pix, orders, errors, cron] = await Promise.all([
    loadLeadRows(admin, now),
    fetchAllRows<GMEvent>((f, t) => admin.from('platform_events').select('event, visitor_id, created_at, utm_source, referrer')
      .in('event', ['landing_view', 'signup_view', 'pricing_view']).gte('created_at', start).range(f, t)),
    fetchAllRows<GMActivity>((f, t) => admin.from('owner_activity').select('establishment_id, day').gte('day', since31).range(f, t)),
    admin.rpc('growth_store_months'),
    fetchAllRows<GMSubEvent>((f, t) => admin.from('subscription_events').select('establishment_id, event, plan_tier, amount, created_at').range(f, t)),
    fetchAllRows<GMNps>((f, t) => admin.from('nps_responses').select('score, created_at').gte('created_at', since90).range(f, t)),
    fetchAllRows<GMTicket>((f, t) => admin.from('support_tickets').select('status, created_at, resolved_at').gte('created_at', since90).range(f, t)),
    fetchAllRows<GMSpend>((f, t) => admin.from('growth_marketing_spend').select('month, channel, amount').range(f, t)),
    fetchAllRows<{ customer_rating: number }>((f, t) => admin.from('orders').select('customer_rating').not('customer_rating', 'is', null).gte('created_at', start).range(f, t)),
    admin.from('orders').select('id', { count: 'exact', head: true }).eq('payment_method', 'mercadopago_pix').eq('payment_status', 'approved').neq('status', 'cancelled').gte('created_at', start),
    fetchAllRows<{ total: number; status: string }>((f, t) => admin.from('orders').select('total, status').neq('status', 'cancelled').gte('created_at', start).range(f, t)),
    admin.from('error_logs').select('id', { count: 'exact', head: true }).eq('level', 'critical').gte('created_at', since24h),
    admin.from('cron_health').select('last_run_at').eq('job_name', 'advance-automatic-orders').maybeSingle(),
  ])
  if (months.error) throw months.error

  // Tickets ainda abertos de antes dos 90 dias também contam como abertos.
  const { data: oldOpen } = await admin.from('support_tickets').select('status, created_at, resolved_at').neq('status', 'resolvido').lt('created_at', since90)

  const accepted = orders.filter((o) => ['confirmed', 'preparing', 'completed'].includes(o.status))
  const metrics = computeGrowthMetrics({
    now,
    periodDays,
    billingEnabled: base.billingEnabled,
    prices: { essencial: base.essencialPrice, completo: COMPLETO_MONTHLY_PRICE },
    rows: base.rows,
    stores: base.stores,
    stats: base.stats,
    events,
    activity,
    months: (months.data || []) as GMMonth[],
    subEvents: subEvents.map((e) => ({ ...e, amount: e.amount != null ? Number(e.amount) : null })),
    nps,
    tickets: [...tickets, ...((oldOpen || []) as GMTicket[])],
    spend: spend.map((s) => ({ ...s, amount: Number(s.amount) })),
    ratings: ratings.map((r) => r.customer_rating),
    pixPaidOrders: pix.count || 0,
    platformOrders: orders.length,
    gmv: accepted.reduce((a, o) => a + Number(o.total || 0), 0),
    criticalErrors24h: errors.count || 0,
    cronMinutesAgo: cron.data?.last_run_at ? Math.round((now.getTime() - new Date(cron.data.last_run_at).getTime()) / 60_000) : null,
  })
  return { metrics, billingEnabled: base.billingEnabled, rows: base.rows }
}

export type { LeadRow }
