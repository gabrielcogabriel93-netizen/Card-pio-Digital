import { describe, it, expect } from 'vitest'
import { buildLeadRows, computeGrowthMetrics, sourceOf, type GMStore, type GMStats, type GMLead, type MetricsInput } from './growthMetrics'
import { buildInsights } from './growthInsights'
import { stageOf, stageMessage } from './growthStage'
import { normalizeWhatsapp, isValidBrazilWhatsapp, formatWhatsapp, whatsappLink } from './whatsapp'

const NOW = new Date('2026-10-28T15:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()

const store = (id: string, o: Partial<GMStore> = {}): GMStore => ({
  id, name: `Loja ${id}`, created_at: daysAgo(10), subscription_status: 'trial', trial_ends_at: daysAgo(-20), current_period_end: null,
  plan_tier: 'essencial', onboarding_completed: true, whatsapp_number: '11999998888', ...o,
})
const stats = (id: string, o: Partial<GMStats> = {}): GMStats => ({
  establishment_id: id, products_count: 0, orders_total: 0, orders_30d: 0, sales_30d: 0, first_order_at: null, last_order_at: null,
  last_activity_day: null, active_days_30d: 0, push_devices: 0, ...o,
})
const lead = (id: string, o: Partial<GMLead> = {}): GMLead => ({
  id, created_at: daysAgo(2), name: 'Ana Souza', email: `${id}@x.com`, whatsapp: '5511999998888', store_name: null, utm_source: null,
  referrer: null, establishment_id: null, user_id: null, crm_status: 'novo', assigned_to: null, next_follow_up: null, last_contact_at: null, ...o,
})

describe('whatsapp', () => {
  it('normaliza com 55 e valida celular com DDD', () => {
    expect(normalizeWhatsapp('(11) 99999-8888')).toBe('5511999998888')
    expect(normalizeWhatsapp('5511999998888')).toBe('5511999998888')
    expect(isValidBrazilWhatsapp('(11) 99999-8888')).toBe(true)
    expect(isValidBrazilWhatsapp('(11) 89999-8888')).toBe(false)
    expect(isValidBrazilWhatsapp('9999-8888')).toBe(false)
    expect(formatWhatsapp('5511999998888')).toBe('+55 (11) 99999-8888')
    expect(whatsappLink('(11) 99999-8888', 'Oi!')).toBe('https://wa.me/5511999998888?text=Oi!')
    expect(whatsappLink(null)).toBeNull()
  })
})

describe('etapa do contato', () => {
  it('segue o funil e não confunde assinante com cancelado', () => {
    expect(stageOf({ hasAccount: false, billingEnabled: true })).toBe('iniciou')
    expect(stageOf({ hasAccount: true, billingEnabled: true })).toBe('conta_criada')
    expect(stageOf({ hasAccount: true, store: store('a'), stats: stats('a'), billingEnabled: true, now: NOW })).toBe('loja_criada')
    expect(stageOf({ hasAccount: true, store: store('a'), stats: stats('a', { products_count: 3 }), billingEnabled: true, now: NOW })).toBe('cardapio')
    expect(stageOf({ hasAccount: true, store: store('a'), stats: stats('a', { products_count: 3, orders_total: 1 }), billingEnabled: true, now: NOW })).toBe('primeiro_pedido')
    expect(stageOf({ hasAccount: true, store: store('a', { subscription_status: 'active', current_period_end: daysAgo(-10) }), billingEnabled: true, now: NOW })).toBe('assinante')
    expect(stageOf({ hasAccount: true, store: store('a', { subscription_status: 'active', current_period_end: daysAgo(2) }), billingEnabled: true, now: NOW })).toBe('cancelado')
    expect(stageOf({ hasAccount: true, store: store('a', { trial_ends_at: daysAgo(1) }), billingEnabled: true, now: NOW })).toBe('teste_vencido')
    // cobrança desligada: teste não vence
    expect(stageOf({ hasAccount: true, store: store('a', { trial_ends_at: daysAgo(1) }), billingEnabled: false, now: NOW })).toBe('loja_criada')
  })

  it('mensagem pronta usa o primeiro nome e avisa o fim do teste', () => {
    expect(stageMessage('iniciou', { name: 'Ana Souza', senderName: 'Lucas' })).toMatch(/^Oi, Ana! Aqui é Lucas, do Freguês\./)
    expect(stageMessage('cardapio', { name: 'Ana', storeName: 'Pizzaria X', trialDaysLeft: 2 })).toMatch(/termina em 2 dias/)
    expect(stageMessage('cardapio', { name: 'Ana', storeName: 'Pizzaria X', trialDaysLeft: 20 })).toMatch(/divulgou o link/)
  })
})

describe('origem', () => {
  it('lê utm, redes sociais pelo site de origem e direto', () => {
    expect(sourceOf('Instagram', null)).toBe('instagram')
    expect(sourceOf(null, 'https://l.instagram.com/?u=x')).toBe('instagram')
    expect(sourceOf(null, 'https://www.google.com/')).toBe('google')
    expect(sourceOf(null, null)).toBe('direto')
  })
})

describe('contatos e métricas', () => {
  const stores = [
    store('s1', { created_at: daysAgo(5) }),                                                       // sem produto
    store('s2', { created_at: daysAgo(6) }),                                                       // cardápio sem pedido
    store('s3', { created_at: daysAgo(8) }),                                                       // recebendo pedidos
    store('s4', { created_at: daysAgo(60), subscription_status: 'active', current_period_end: daysAgo(-20), plan_tier: 'completo' }),
    store('s5', { created_at: daysAgo(70), subscription_status: 'active', current_period_end: daysAgo(-5) }),
    store('s6', { created_at: daysAgo(40), trial_ends_at: daysAgo(10) }),                          // teste vencido
    store('s7', { created_at: daysAgo(26), trial_ends_at: daysAgo(-3) }),                           // teste acabando
  ]
  const st = [
    stats('s1'),
    stats('s2', { products_count: 5 }),
    stats('s3', { products_count: 5, orders_total: 3, first_order_at: daysAgo(6), last_order_at: daysAgo(1) }),
    stats('s4', { products_count: 9, orders_total: 80, first_order_at: daysAgo(55), last_order_at: daysAgo(1), last_activity_day: daysAgo(0).slice(0, 10) }),
    stats('s5', { products_count: 9, orders_total: 20, first_order_at: daysAgo(65), last_order_at: daysAgo(20), last_activity_day: daysAgo(15).slice(0, 10) }),
    stats('s6', { products_count: 2 }),
    stats('s7', { products_count: 2 }),
  ]
  const leads = [
    lead('l0', { created_at: daysAgo(1), utm_source: 'instagram' }),       // parou no cadastro
    lead('l00', { created_at: daysAgo(0.01) }),                             // começou agora (menos de 1h)
    ...stores.map((s, i) => lead(`l${i + 1}`, { establishment_id: s.id, user_id: 'u' + i, created_at: s.created_at, utm_source: i < 2 ? 'instagram' : null })),
  ]
  const rows = buildLeadRows({ leads, stores, stats: st, accountEmails: new Set(), everPaid: new Set(['s4', 's5']), billingEnabled: true, now: NOW })
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]))

  it('marca quem precisa de contato', () => {
    expect(byId.l0.flags).toContain('parados_cadastro')
    expect(byId.l00.flags).not.toContain('parados_cadastro')
    expect(byId.l1.stage).toBe('loja_criada')
    expect(byId.l1.flags).toContain('sem_produto')
    expect(byId.l2.flags).toContain('sem_pedido')
    expect(byId.l5.stage).toBe('assinante')
    expect(byId.l5.flags).toContain('assinante_inativo')
    expect(byId.l4.flags).not.toContain('assinante_inativo')
    expect(byId.l7.flags).toContain('teste_acabando')
    expect(byId.l6.stage).toBe('teste_vencido')
  })

  const input: MetricsInput = {
    now: NOW, periodDays: 30, billingEnabled: true, prices: { essencial: 49.9, completo: 97 }, rows, stores, stats: st,
    events: [
      ...Array.from({ length: 40 }, (_, i) => ({ event: 'landing_view', visitor_id: `v${i}`, created_at: daysAgo(3), utm_source: i < 10 ? 'instagram' : null, referrer: null })),
      { event: 'landing_view', visitor_id: 'v1', created_at: daysAgo(2), utm_source: null, referrer: null },
      { event: 'landing_view', visitor_id: 'velho', created_at: daysAgo(60), utm_source: null, referrer: null },
    ],
    activity: [
      { establishment_id: 's4', day: '2026-10-28' }, { establishment_id: 's3', day: '2026-10-28' },
      { establishment_id: 's4', day: '2026-10-27' }, { establishment_id: 's2', day: '2026-10-20' },
    ],
    months: [
      { establishment_id: 's4', month: '2026-08-01', orders: 10, active_days: 5 },
      { establishment_id: 's4', month: '2026-09-01', orders: 20, active_days: 10 },
      { establishment_id: 's5', month: '2026-08-01', orders: 5, active_days: 2 },
    ],
    subEvents: [
      { establishment_id: 's4', event: 'paid', plan_tier: 'completo', amount: 97, created_at: daysAgo(10) },
      { establishment_id: 's5', event: 'paid', plan_tier: 'essencial', amount: 49.9, created_at: daysAgo(40) },
      { establishment_id: 's5', event: 'paid', plan_tier: 'essencial', amount: 49.9, created_at: daysAgo(10) },
      { establishment_id: 's7', event: 'checkout_started', plan_tier: 'essencial', amount: 49.9, created_at: daysAgo(5) },
      { establishment_id: 's4', event: 'checkout_started', plan_tier: 'completo', amount: 97, created_at: daysAgo(10.1) },
    ],
    nps: [{ score: 10, created_at: daysAgo(5) }, { score: 9, created_at: daysAgo(5) }, { score: 3, created_at: daysAgo(5) }, { score: 8, created_at: daysAgo(5) }],
    tickets: [{ status: 'aberto', created_at: daysAgo(1), resolved_at: null }, { status: 'resolvido', created_at: daysAgo(3), resolved_at: new Date(new Date(daysAgo(3)).getTime() + 4 * 3_600_000).toISOString() }],
    spend: [{ month: '2026-10-01', channel: 'instagram', amount: 300 }],
    ratings: [5, 5, 4, 3],
    pixPaidOrders: 12, platformOrders: 40, gmv: 2500, criticalErrors24h: 0, cronMinutesAgo: 1,
  }
  const m = computeGrowthMetrics(input)

  it('aquisição: visitantes únicos do período, conversão e CAC', () => {
    expect(m.acquisition.visitors).toBe(40)
    expect(m.acquisition.leads).toBe(6) // l0, l00 e as lojas s1, s2, s3 e s7 (s4, s5 e s6 são de antes do período)
    expect(m.acquisition.stores).toBe(4)
    expect(m.acquisition.newPaying).toBe(1) // 1º pagamento da s4 caiu no período; a s5 já pagava antes
    expect(m.acquisition.spend).toBe(300)
    expect(m.acquisition.cac).toBe(300)
    expect(m.acquisition.sources.find((s) => s.source === 'instagram')).toEqual({ source: 'instagram', visitors: 10, leads: 3, stores: 2, paying: 0 })
  })

  it('ativação das lojas novas', () => {
    expect(m.activation.cohort).toBe(4)
    expect(m.activation.products).toBe(75)
    expect(m.activation.firstOrder).toBe(25)
    expect(m.activation.medianDaysToFirstOrder).toBe(2)
  })

  it('engajamento e receita', () => {
    expect(m.engagement.dau).toBe(2)
    expect(m.engagement.mau).toBe(3)
    expect(m.revenue.paying).toBe(2)
    expect(m.revenue.mrr).toBe(146.9)
    expect(m.revenue.payingCompleto).toBe(1)
    expect(m.revenue.pixRevenue).toBe(12)
  })

  it('conversão, abandono do pagamento e satisfação', () => {
    expect(m.conversion.trialEnded).toBe(1)
    expect(m.conversion.trialToPaid).toBe(0)
    expect(m.conversion.trialEndingIn7d).toBe(1)
    expect(m.conversion.checkoutsStarted).toBe(2)
    expect(m.conversion.checkoutAbandoned).toBe(1)
    expect(m.satisfaction.nps).toBe(25)
    expect(m.satisfaction.csatAvg).toBe(4.3)
    expect(m.satisfaction.ticketsOpen).toBe(1)
    expect(m.satisfaction.avgResolutionHours).toBe(4)
  })

  it('parecer aponta o cron parado como crítico e lista contatos do dia', () => {
    const broken = computeGrowthMetrics({ ...input, cronMinutesAgo: 90 })
    const { items, bottleneck } = buildInsights(broken, { billingEnabled: true })
    expect(bottleneck?.area).toBe('saude')
    expect(items.some((i) => i.filter === 'teste_acabando')).toBe(true)
    expect(items.some((i) => i.area === 'acoes' && i.filter === 'parados_cadastro')).toBe(true)
    expect(items[0].severity).toBe('critico')
  })
})
