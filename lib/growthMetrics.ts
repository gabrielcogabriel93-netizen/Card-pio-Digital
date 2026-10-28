// Métricas de crescimento do SaaS (aba Crescimento do admin), calculadas
// a partir dos dados brutos. Funções puras: a rota só busca os dados e
// entrega aqui, e os testes conferem cada conta com números conhecidos.
import { isPaying, stageOf, type GrowthStage, STAGE_ORDER } from './growthStage'

const DAY = 86_400_000

export interface GMStore {
  id: string
  name: string
  created_at: string
  subscription_status: string | null
  trial_ends_at: string | null
  current_period_end: string | null
  plan_tier: string | null
  onboarding_completed: boolean | null
  whatsapp_number: string | null
}

export interface GMStats {
  establishment_id: string
  products_count: number
  orders_total: number
  orders_30d: number
  sales_30d: number
  first_order_at: string | null
  last_order_at: string | null
  last_activity_day: string | null
  active_days_30d: number
  push_devices: number
}

export interface GMLead {
  id: string
  created_at: string
  name: string | null
  email: string | null
  whatsapp: string | null
  store_name: string | null
  utm_source: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  referrer: string | null
  establishment_id: string | null
  user_id: string | null
  crm_status: string
  assigned_to: string | null
  next_follow_up: string | null
  last_contact_at: string | null
}

export interface GMEvent { event: string; visitor_id: string | null; created_at: string; utm_source: string | null; referrer: string | null }
export interface GMActivity { establishment_id: string; day: string }
export interface GMMonth { establishment_id: string; month: string; orders: number; active_days: number }
export interface GMSubEvent { establishment_id: string | null; event: string; plan_tier: string | null; amount: number | null; created_at: string }
export interface GMNps { score: number; comment?: string | null; created_at: string; establishment_id?: string }
export interface GMTicket { status: string; created_at: string; resolved_at: string | null }
export interface GMSpend { month: string; channel: string; amount: number }

export type LeadFlag = 'parados_cadastro' | 'sem_produto' | 'sem_pedido' | 'teste_acabando' | 'assinante_inativo' | 'followup_hoje'

export const FLAG_LABELS: Record<LeadFlag, string> = {
  parados_cadastro: 'Pararam no cadastro',
  sem_produto: 'Loja sem produtos',
  sem_pedido: 'Cardápio sem pedidos',
  teste_acabando: 'Teste acabando',
  assinante_inativo: 'Assinante sumido',
  followup_hoje: 'Retornar hoje',
}

export interface LeadRow extends GMLead {
  stage: GrowthStage
  flags: LeadFlag[]
  hasAccount: boolean
  store: GMStore | null
  stats: GMStats | null
  trialDaysLeft: number | null
  source: string
}

/** Origem legível: utm_source, senão o site que mandou, senão "direto". */
export function sourceOf(utm: string | null | undefined, referrer: string | null | undefined): string {
  if (utm && utm.trim()) return utm.trim().toLowerCase()
  if (referrer) {
    try {
      const host = new URL(referrer).hostname.replace(/^www\./, '').replace(/^m\./, '').replace(/^l\./, '')
      if (/instagram/.test(host)) return 'instagram'
      if (/facebook|fb\./.test(host)) return 'facebook'
      if (/google/.test(host)) return 'google'
      if (/whatsapp|wa\.me/.test(host)) return 'whatsapp'
      if (/tiktok/.test(host)) return 'tiktok'
      if (/youtube|youtu\.be/.test(host)) return 'youtube'
      return host
    } catch {
      return 'direto'
    }
  }
  return 'direto'
}

const spDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const spMonth = (iso: string) => spDay(new Date(iso)).slice(0, 7)
const pct = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 1000) / 10 : null)
const round2 = (n: number) => Math.round(n * 100) / 100
const median = (xs: number[]): number | null => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export interface LeadRowsInput {
  leads: GMLead[]
  stores: GMStore[]
  stats: GMStats[]
  accountEmails: Set<string>
  everPaid: Set<string>
  billingEnabled: boolean
  now?: Date
}

/** Junta contato + loja + números e calcula etapa e alertas de cada um. */
export function buildLeadRows(input: LeadRowsInput): LeadRow[] {
  const now = input.now || new Date()
  const today = spDay(now)
  const stores = new Map(input.stores.map((s) => [s.id, s]))
  const stats = new Map(input.stats.map((s) => [s.establishment_id, s]))
  return input.leads.map((lead) => {
    const store = lead.establishment_id ? stores.get(lead.establishment_id) || null : null
    const st = store ? stats.get(store.id) || null : null
    const hasAccount = !!lead.user_id || (!!lead.email && input.accountEmails.has(lead.email.toLowerCase()))
    const stage = stageOf({ hasAccount, store, stats: st, billingEnabled: input.billingEnabled, everPaid: store ? input.everPaid.has(store.id) : false, now })
    const trialDaysLeft = store && store.subscription_status === 'trial' && store.trial_ends_at && input.billingEnabled
      ? Math.ceil((new Date(store.trial_ends_at).getTime() - now.getTime()) / DAY)
      : null
    const ageH = (now.getTime() - new Date(store?.created_at || lead.created_at).getTime()) / 3_600_000
    const flags: LeadFlag[] = []
    const open = lead.crm_status !== 'perdido' && lead.crm_status !== 'convertido'
    if ((stage === 'iniciou' || stage === 'conta_criada') && ageH >= 1 && ageH <= 24 * 30 && open) flags.push('parados_cadastro')
    if (stage === 'loja_criada' && ageH >= 24) flags.push('sem_produto')
    if (stage === 'cardapio' && ageH >= 72) flags.push('sem_pedido')
    if (trialDaysLeft != null && trialDaysLeft >= 0 && trialDaysLeft <= 5 && stage !== 'assinante') flags.push('teste_acabando')
    if (stage === 'assinante' && st) {
      const last = st.last_activity_day ? new Date(st.last_activity_day + 'T12:00:00Z').getTime() : 0
      const lastOrder = st.last_order_at ? new Date(st.last_order_at).getTime() : 0
      if (now.getTime() - Math.max(last, lastOrder) > 7 * DAY) flags.push('assinante_inativo')
    }
    if (lead.next_follow_up && lead.next_follow_up <= today && lead.crm_status !== 'perdido') flags.push('followup_hoje')
    return { ...lead, stage, flags, hasAccount, store, stats: st, trialDaysLeft, source: sourceOf(lead.utm_source, lead.referrer) }
  })
}

export interface MetricsInput {
  now?: Date
  periodDays: number
  billingEnabled: boolean
  prices: { essencial: number; completo: number }
  rows: LeadRow[]
  stores: GMStore[]
  stats: GMStats[]
  events: GMEvent[]
  activity: GMActivity[]
  months: GMMonth[]
  subEvents: GMSubEvent[]
  nps: GMNps[]
  tickets: GMTicket[]
  spend: GMSpend[]
  ratings: number[]
  pixPaidOrders: number
  platformOrders: number
  gmv: number
  criticalErrors24h: number
  cronMinutesAgo: number | null
}

export function computeGrowthMetrics(input: MetricsInput) {
  const now = input.now || new Date()
  const start = new Date(now.getTime() - input.periodDays * DAY)
  const inPeriod = (iso: string | null | undefined) => !!iso && new Date(iso) >= start && new Date(iso) <= now
  const statsById = new Map(input.stats.map((s) => [s.establishment_id, s]))

  // ---------- 1. Aquisição ----------
  const firstTouch = new Map<string, GMEvent>()
  for (const e of [...input.events].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (!inPeriod(e.created_at) || !e.visitor_id) continue
    if (e.event !== 'landing_view' && e.event !== 'signup_view' && e.event !== 'pricing_view') continue
    if (!firstTouch.has(e.visitor_id)) firstTouch.set(e.visitor_id, e)
  }
  const visitors = firstTouch.size
  const signupViewers = new Set(input.events.filter((e) => e.event === 'signup_view' && inPeriod(e.created_at) && e.visitor_id).map((e) => e.visitor_id)).size
  const periodRows = input.rows.filter((r) => inPeriod(r.created_at))
  const leadsInPeriod = periodRows.length
  const storesInPeriod = input.stores.filter((s) => inPeriod(s.created_at))
  const newPaidStores = new Set<string>()
  const firstPaid = new Map<string, string>()
  for (const ev of input.subEvents) {
    if (ev.event !== 'paid' || !ev.establishment_id) continue
    const prev = firstPaid.get(ev.establishment_id)
    if (!prev || ev.created_at < prev) firstPaid.set(ev.establishment_id, ev.created_at)
  }
  firstPaid.forEach((at, id) => { if (inPeriod(at)) newPaidStores.add(id) })

  const sources = new Map<string, { source: string; visitors: number; leads: number; stores: number; paying: number }>()
  const src = (k: string) => sources.get(k) || sources.set(k, { source: k, visitors: 0, leads: 0, stores: 0, paying: 0 }).get(k)!
  firstTouch.forEach((e) => src(sourceOf(e.utm_source, e.referrer)).visitors++)
  for (const r of periodRows) {
    const s = src(r.source)
    s.leads++
    if (r.store) s.stores++
    if (r.stage === 'assinante') s.paying++
  }
  const startMonth = spMonth(start.toISOString())
  const spendInPeriod = input.spend.filter((s) => s.month.slice(0, 7) >= startMonth && s.month.slice(0, 7) <= spMonth(now.toISOString()))
  const totalSpend = round2(spendInPeriod.reduce((a, s) => a + Number(s.amount), 0))
  const acquisition = {
    visitors,
    signupViewers,
    leads: leadsInPeriod,
    stores: storesInPeriod.length,
    newPaying: newPaidStores.size,
    visitorToLead: pct(leadsInPeriod, visitors),
    leadToStore: pct(periodRows.filter((r) => r.store).length, leadsInPeriod),
    visitorToStore: pct(storesInPeriod.length, visitors),
    spend: totalSpend,
    cac: newPaidStores.size > 0 && totalSpend > 0 ? round2(totalSpend / newPaidStores.size) : null,
    costPerStore: storesInPeriod.length > 0 && totalSpend > 0 ? round2(totalSpend / storesInPeriod.length) : null,
    sources: Array.from(sources.values()).sort((a, b) => b.leads - a.leads || b.visitors - a.visitors).slice(0, 12),
  }

  // ---------- 2. Ativação (lojas criadas no período) ----------
  const cohort = storesInPeriod
  const withProducts = cohort.filter((s) => (statsById.get(s.id)?.products_count || 0) > 0)
  const withOrder = cohort.filter((s) => statsById.get(s.id)?.first_order_at)
  const daysToFirst = withOrder.map((s) => (new Date(statsById.get(s.id)!.first_order_at!).getTime() - new Date(s.created_at).getTime()) / DAY)
  const funnel = STAGE_ORDER.map((stage) => ({ stage, count: input.rows.filter((r) => r.stage === stage).length }))
  const activation = {
    cohort: cohort.length,
    onboarding: pct(cohort.filter((s) => s.onboarding_completed).length, cohort.length),
    products: pct(withProducts.length, cohort.length),
    firstOrder: pct(withOrder.length, cohort.length),
    firstOrderIn7d: pct(daysToFirst.filter((d) => d <= 7).length, cohort.length),
    medianDaysToFirstOrder: daysToFirst.length ? Math.round(median(daysToFirst)! * 10) / 10 : null,
    funnel,
  }

  // ---------- 3. Engajamento ----------
  const today = spDay(now)
  const dayMinus = (n: number) => spDay(new Date(now.getTime() - n * DAY))
  const activeSince = (n: number) => new Set(input.activity.filter((a) => a.day > dayMinus(n)).map((a) => a.establishment_id))
  const dau = new Set(input.activity.filter((a) => a.day === today).map((a) => a.establishment_id)).size
  const wau = activeSince(7).size
  const mauSet = activeSince(30)
  const mau = mauSet.size
  const last7: number[] = []
  for (let i = 0; i < 7; i++) {
    const d = dayMinus(i)
    last7.push(new Set(input.activity.filter((a) => a.day === d).map((a) => a.establishment_id)).size)
  }
  const avgDau = last7.reduce((a, b) => a + b, 0) / 7
  const freq = mau ? input.activity.filter((a) => a.day > dayMinus(30) && mauSet.has(a.establishment_id)).length / mau : null
  const storesWithOrders7d = input.stats.filter((s) => s.last_order_at && now.getTime() - new Date(s.last_order_at).getTime() <= 7 * DAY).length
  const engagement = {
    dau,
    wau,
    mau,
    stickiness: mau ? Math.round((avgDau / mau) * 1000) / 10 : null,
    avgActiveDays30: freq != null ? Math.round(freq * 10) / 10 : null,
    storesWithOrders7d,
    totalStores: input.stores.length,
    platformOrders: input.platformOrders,
    gmv: round2(input.gmv),
  }

  // ---------- 4. Retenção ----------
  const monthsByStore = new Map<string, Map<string, GMMonth>>()
  for (const m of input.months) {
    const key = m.month.slice(0, 7)
    const map = monthsByStore.get(m.establishment_id) || monthsByStore.set(m.establishment_id, new Map()).get(m.establishment_id)!
    map.set(key, m)
  }
  const addMonths = (ym: string, n: number) => {
    const [y, m] = ym.split('-').map(Number)
    const d = new Date(Date.UTC(y, m - 1 + n, 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  }
  const currentMonth = spMonth(now.toISOString())
  const cohorts = [5, 4, 3, 2, 1, 0].map((back) => {
    const month = addMonths(currentMonth, -back)
    const members = input.stores.filter((s) => spMonth(s.created_at) === month)
    const rate = (k: number) => {
      const target = addMonths(month, k)
      if (target > currentMonth) return null
      const active = members.filter((s) => {
        const m = monthsByStore.get(s.id)?.get(target)
        return m && (m.orders > 0 || m.active_days > 0)
      }).length
      return pct(active, members.length)
    }
    return { month, size: members.length, m1: rate(1), m2: rate(2), m3: rate(3) }
  })

  const payingStores = input.stores.filter((s) => isPaying(s, now))
  const canceled = new Set(input.subEvents.filter((e) => e.event === 'canceled' && e.establishment_id && inPeriod(e.created_at)).map((e) => e.establishment_id!))
  for (const s of input.stores) {
    if (s.subscription_status === 'active' && s.current_period_end && inPeriod(s.current_period_end) && !isPaying(s, now)) canceled.add(s.id)
  }
  const payingAtStart = Math.max(payingStores.length - newPaidStores.size + canceled.size, 0)
  const churnPeriod = payingAtStart > 0 ? canceled.size / payingAtStart : null
  const monthlyChurn = churnPeriod != null ? Math.min(1, churnPeriod * (30 / input.periodDays)) : null
  const atRisk = input.rows.filter((r) => r.flags.includes('assinante_inativo')).length
  const retention = {
    cohorts,
    churned: canceled.size,
    payingAtStart,
    monthlyChurn: monthlyChurn != null ? Math.round(monthlyChurn * 1000) / 10 : null,
    atRisk,
  }

  // ---------- 5. Receita ----------
  const priceOf = (s: GMStore) => (s.plan_tier === 'completo' ? input.prices.completo : input.prices.essencial)
  const mrr = round2(payingStores.reduce((a, s) => a + priceOf(s), 0))
  const arpu = payingStores.length ? round2(mrr / payingStores.length) : null
  const churnForLtv = monthlyChurn != null && monthlyChurn > 0 ? monthlyChurn : null
  const revenue = {
    mrr,
    arr: round2(mrr * 12),
    paying: payingStores.length,
    payingEssencial: payingStores.filter((s) => s.plan_tier !== 'completo').length,
    payingCompleto: payingStores.filter((s) => s.plan_tier === 'completo').length,
    arpu,
    ltv: arpu != null ? round2(churnForLtv ? arpu / churnForLtv : arpu * 24) : null,
    ltvEstimated: !churnForLtv,
    pixRevenue: round2(input.pixPaidOrders * 1),
    paidInPeriod: round2(input.subEvents.filter((e) => e.event === 'paid' && inPeriod(e.created_at)).reduce((a, e) => a + Number(e.amount || 0), 0)),
  }

  // ---------- 6. Conversão ----------
  const trialEnded = input.stores.filter((s) => s.trial_ends_at && new Date(s.trial_ends_at) <= now && new Date(s.trial_ends_at) >= new Date(now.getTime() - 90 * DAY))
  const converted = trialEnded.filter((s) => isPaying(s, now) || firstPaid.has(s.id))
  const inTrial = input.billingEnabled ? input.stores.filter((s) => s.subscription_status === 'trial' && s.trial_ends_at && new Date(s.trial_ends_at) > now) : []
  const checkouts = input.subEvents.filter((e) => e.event === 'checkout_started' && e.establishment_id && inPeriod(e.created_at))
  const checkoutStores = new Map<string, string>()
  for (const c of checkouts) {
    const prev = checkoutStores.get(c.establishment_id!)
    if (!prev || c.created_at < prev) checkoutStores.set(c.establishment_id!, c.created_at)
  }
  let abandoned = 0
  checkoutStores.forEach((at, id) => {
    const paidAfter = input.subEvents.some((e) => e.event === 'paid' && e.establishment_id === id && e.created_at >= at && new Date(e.created_at).getTime() - new Date(at).getTime() <= 3 * DAY)
    if (!paidAfter) abandoned++
  })
  const conversion = {
    trialEnded: trialEnded.length,
    trialConverted: converted.length,
    trialToPaid: pct(converted.length, trialEnded.length),
    inTrial: inTrial.length,
    trialEndingIn7d: inTrial.filter((s) => new Date(s.trial_ends_at!).getTime() - now.getTime() <= 7 * DAY).length,
    checkoutsStarted: checkoutStores.size,
    checkoutAbandoned: abandoned,
    checkoutAbandonRate: pct(abandoned, checkoutStores.size),
  }

  // ---------- 7. Satisfação ----------
  const nps90 = input.nps.filter((n) => new Date(n.created_at).getTime() >= now.getTime() - 90 * DAY)
  const promoters = nps90.filter((n) => n.score >= 9).length
  const detractors = nps90.filter((n) => n.score <= 6).length
  const ratingsOk = input.ratings.filter((r) => r >= 1 && r <= 5)
  const resolved = input.tickets.filter((t) => t.resolved_at && inPeriod(t.resolved_at))
  const satisfaction = {
    npsResponses: nps90.length,
    nps: nps90.length ? Math.round(((promoters - detractors) / nps90.length) * 100) : null,
    promoters,
    passives: nps90.length - promoters - detractors,
    detractors,
    csatAvg: ratingsOk.length ? Math.round((ratingsOk.reduce((a, b) => a + b, 0) / ratingsOk.length) * 10) / 10 : null,
    csatPositive: pct(ratingsOk.filter((r) => r >= 4).length, ratingsOk.length),
    ratingsCount: ratingsOk.length,
    ticketsOpen: input.tickets.filter((t) => t.status !== 'resolvido').length,
    ticketsInPeriod: input.tickets.filter((t) => inPeriod(t.created_at)).length,
    avgResolutionHours: resolved.length
      ? Math.round((resolved.reduce((a, t) => a + (new Date(t.resolved_at!).getTime() - new Date(t.created_at).getTime()), 0) / resolved.length / 3_600_000) * 10) / 10
      : null,
  }

  // ---------- Saúde e listas de ação ----------
  const flagCounts = {} as Record<string, number>
  for (const r of input.rows) for (const f of r.flags) flagCounts[f] = (flagCounts[f] || 0) + 1

  return {
    periodDays: input.periodDays,
    generatedAt: now.toISOString(),
    acquisition,
    activation,
    engagement,
    retention,
    revenue,
    conversion,
    satisfaction,
    health: { criticalErrors24h: input.criticalErrors24h, cronMinutesAgo: input.cronMinutesAgo },
    flagCounts,
  }
}

export type GrowthMetrics = ReturnType<typeof computeGrowthMetrics>
