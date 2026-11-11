// Crescimento do SaaS (migrations 056, 057 e 058): teste de 30 dias,
// contatos do cadastro, avisos ao dono, uso do painel, NPS e suporte.
import { createDb, as } from './harness.mjs'
import assert from 'node:assert/strict'

const OWNER = '00000000-0000-0000-0000-0000000000a1'
const OWNER2 = '00000000-0000-0000-0000-0000000000a2'
const EST = '10000000-0000-0000-0000-000000000001'
const results = []
let passed = 0
async function test(name, fn) {
  try {
    await db.exec('DELETE FROM rate_limit_hits;')
    await fn()
    passed++
    results.push(`  ok  ${name}`)
  } catch (e) {
    results.push(`FALHA ${name}\n      ${e.message}`)
  }
}
async function rejects(promise, re) {
  try {
    await promise
  } catch (e) {
    if (re && !re.test(e.message)) throw new Error(`erro inesperado: ${e.message}`)
    return
  }
  throw new Error('deveria ter falhado')
}

const db = await createDb()
const anon = (sql, params) => as(db, 'anon', null, sql, params)
const owner = (sql, params) => as(db, 'authenticated', OWNER, sql, params)
const alerts = async (kind) => (await db.query('SELECT * FROM owner_alerts WHERE kind = $1 ORDER BY created_at', [kind])).rows

await db.exec(`
  INSERT INTO auth.users VALUES ('${OWNER}', 'dono@loja.com'), ('${OWNER2}', 'outro@loja.com');
  INSERT INTO platform_settings (id, billing_enabled, monthly_price) VALUES (true, true, 49.9) ON CONFLICT (id) DO UPDATE SET billing_enabled = true;
  UPDATE platform_settings SET trial_enabled = true, trial_days = 30;
`)

await test('cadastro: passo 1 grava o contato com WhatsApp e avisa o dono', async () => {
  const id = (await anon(`SELECT register_signup_lead($1::jsonb) id`, [JSON.stringify({ name: 'Ana Souza', email: 'Dono@Loja.com', whatsapp: '(11) 99999-8888', utm_source: 'instagram' })])).rows[0].id
  const lead = (await db.query('SELECT * FROM growth_leads WHERE id = $1', [id])).rows[0]
  assert.equal(lead.email, 'dono@loja.com')
  assert.equal(lead.whatsapp, '5511999998888')
  assert.equal(lead.utm_source, 'instagram')
  const a = await alerts('lead')
  assert.equal(a.length, 1)
  assert.match(a[0].body, /Ana Souza · WhatsApp 5511999998888 · via instagram/)
})

await test('cadastro: repetir o passo 1 atualiza o mesmo contato (sem duplicar nem trocar a origem)', async () => {
  await anon(`SELECT register_signup_lead($1::jsonb)`, [JSON.stringify({ name: 'Ana S.', email: 'dono@loja.com', whatsapp: '11988887777', utm_source: 'google', store_name: 'Pizzaria da Ana' })])
  const rows = (await db.query(`SELECT * FROM growth_leads WHERE lower(email) = 'dono@loja.com'`)).rows
  assert.equal(rows.length, 1)
  assert.equal(rows[0].whatsapp, '5511988887777')
  assert.equal(rows[0].store_name, 'Pizzaria da Ana')
  assert.equal(rows[0].utm_source, 'instagram')
  assert.equal((await alerts('lead')).length, 1)
})

await test('cadastro: recusa WhatsApp sem DDD e e-mail inválido', async () => {
  await rejects(anon(`SELECT register_signup_lead($1::jsonb)`, [JSON.stringify({ email: 'x@y.com', whatsapp: '99998888' })]), /WhatsApp/)
  await rejects(anon(`SELECT register_signup_lead($1::jsonb)`, [JSON.stringify({ email: 'nao-e-email', whatsapp: '11999998888' })]), /E-mail/)
})

await test('loja criada: liga ao contato pelo e-mail, avisa o dono e nasce com 30 dias de teste', async () => {
  await db.exec(`INSERT INTO establishments (id, owner_id, name, slug, whatsapp_number) VALUES ('${EST}', '${OWNER}', 'Pizzaria da Ana', 'pizzaria-da-ana', '(11) 98888-7777')`)
  const lead = (await db.query(`SELECT * FROM growth_leads WHERE lower(email) = 'dono@loja.com'`)).rows[0]
  assert.equal(lead.establishment_id, EST)
  assert.equal(lead.user_id, OWNER)
  const a = await alerts('loja')
  assert.equal(a.length, 1)
  assert.match(a[0].url, new RegExp(lead.id))
  const est = (await db.query(`SELECT round(extract(epoch FROM trial_ends_at - created_at) / 86400) AS d FROM establishments WHERE id = '${EST}'`)).rows[0]
  assert.equal(Number(est.d), 30)
})

await test('loja sem passo 1 (conta antiga) vira contato com o WhatsApp da loja', async () => {
  await db.exec(`INSERT INTO establishments (owner_id, name, slug, whatsapp_number) VALUES ('${OWNER2}', 'Lanches do Beto', 'lanches-do-beto', '21 97777-6666')`)
  const lead = (await db.query(`SELECT * FROM growth_leads WHERE email = 'outro@loja.com'`)).rows[0]
  assert.equal(lead.whatsapp, '5521977776666')
  assert.ok(lead.establishment_id)
  assert.equal((await alerts('lead')).length, 1, 'não avisa como "cadastro iniciado"')
})

await test('teste de 30 dias: quem já estava em teste ganha os dias que faltam', async () => {
  await db.exec(`
    SELECT set_config('request.jwt.claim.role', 'service_role', false);
    UPDATE establishments SET trial_ends_at = created_at + interval '7 days' WHERE id = '${EST}';
    UPDATE establishments SET trial_ends_at = created_at + INTERVAL '45 days' WHERE slug = 'lanches-do-beto';
    SELECT set_config('request.jwt.claim.role', '', false);
  `)
  const fs = await import('node:fs')
  await db.exec(fs.readFileSync(new URL('../migrations/056_teste_30_dias.sql', import.meta.url), 'utf8'))
  const rows = (await db.query(`SELECT slug, round(extract(epoch FROM trial_ends_at - created_at) / 86400) AS d FROM establishments ORDER BY slug`)).rows
  assert.deepEqual(rows.map((r) => [r.slug, Number(r.d)]), [['lanches-do-beto', 45], ['pizzaria-da-ana', 30]])
})

await test('1º pedido da loja avisa o dono uma vez só', async () => {
  for (const n of [1, 2]) {
    await db.query(`INSERT INTO orders (establishment_id, customer_name, customer_phone, items, subtotal, total, status) VALUES ($1, 'C', $2, '[]', 30, 30, 'pending')`, [EST, `1197000000${n}`])
  }
  const a = await alerts('primeiro_pedido')
  assert.equal(a.length, 1)
  assert.match(a[0].title, /Pizzaria da Ana recebeu o 1º pedido/)
})

await test('uso do painel: um registro por dia, só da própria loja', async () => {
  await owner('SELECT touch_owner_activity()')
  await owner('SELECT touch_owner_activity()')
  const rows = (await db.query('SELECT * FROM owner_activity')).rows
  assert.equal(rows.length, 1)
  assert.equal(rows[0].hits, 2)
  await rejects(anon('SELECT touch_owner_activity()'), /permission|denied/i)
})

await test('NPS: só pergunta depois de 14 dias; nota baixa avisa o dono', async () => {
  assert.equal((await owner('SELECT nps_due() d')).rows[0].d, false)
  await db.exec(`UPDATE establishments SET created_at = now() - interval '20 days' WHERE id = '${EST}'`)
  assert.equal((await owner('SELECT nps_due() d')).rows[0].d, true)
  await owner(`SELECT submit_nps(4, 'Faltou ajuda para configurar')`)
  assert.equal((await owner('SELECT nps_due() d')).rows[0].d, false)
  const a = await alerts('nps')
  assert.equal(a.length, 1)
  assert.match(a[0].body, /Faltou ajuda/)
  await rejects(owner('SELECT submit_nps(11)'), /Nota inválida/)
})

await test('suporte: lojista abre chamado (com WhatsApp da loja) e vê só os seus', async () => {
  const id = (await owner(`SELECT open_support_ticket('Problema com pedidos', 'O alarme não toca') id`)).rows[0].id
  const t = (await db.query('SELECT * FROM support_tickets WHERE id = $1', [id])).rows[0]
  assert.equal(t.whatsapp, '5511988887777')
  assert.equal((await alerts('suporte')).length, 1)
  assert.equal((await owner('SELECT count(*)::int c FROM support_tickets')).rows[0].c, 1)
  assert.equal((await as(db, 'authenticated', OWNER2, 'SELECT count(*)::int c FROM support_tickets')).rows[0].c, 0)
  await rejects(owner(`SELECT open_support_ticket('', 'x')`), /assunto/)
})

await test('visitas: só eventos da lista; tabelas da equipe fechadas para lojista e visitante', async () => {
  await anon(`SELECT track_platform_event('landing_view', '{"visitor_id":"v1","utm_source":"instagram"}'::jsonb)`)
  await anon(`SELECT track_platform_event('qualquer_coisa', '{}'::jsonb)`)
  assert.equal((await db.query('SELECT count(*)::int c FROM platform_events')).rows[0].c, 1)
  for (const table of ['growth_leads', 'growth_lead_notes', 'platform_events', 'owner_alerts', 'owner_push_subscriptions', 'nps_responses', 'growth_marketing_spend', 'subscription_events', 'platform_team']) {
    assert.equal((await owner(`SELECT count(*)::int c FROM ${table}`)).rows[0].c, 0, `lojista leu ${table}`)
    assert.equal((await anon(`SELECT count(*)::int c FROM ${table}`)).rows[0].c, 0, `visitante leu ${table}`)
  }
  await rejects(owner('SELECT * FROM growth_store_stats()'), /permission|denied/i)
  await rejects(owner(`SELECT add_owner_alert('x', 'y', null, null)`), /permission|denied/i)
})

await test('assinatura paga/cancelada e erro crítico avisam o dono (erro: 1 por hora por área)', async () => {
  await db.exec(`INSERT INTO subscription_events (establishment_id, event, plan_tier, amount, external_id) VALUES ('${EST}', 'paid', 'completo', 97, 'in_1'), ('${EST}', 'checkout_started', 'completo', 97, NULL)`)
  const a = await alerts('assinatura')
  assert.equal(a.length, 1)
  assert.match(a[0].title, /pagou o plano completo/)
  await db.exec(`INSERT INTO error_logs (scope, message, level) VALUES ('pedido', 'falhou 1', 'critical'), ('pedido', 'falhou 2', 'critical'), ('pedido', 'só erro', 'error')`)
  assert.equal((await alerts('erro')).length, 1)
})

await test('números por loja e por mês rodam para a service role', async () => {
  const s = (await as(db, 'service_role', null, `SELECT * FROM growth_store_stats() WHERE establishment_id = $1`, [EST])).rows[0]
  assert.equal(s.orders_total, 2)
  assert.equal(s.active_days_30d, 1)
  const m = (await as(db, 'service_role', null, `SELECT * FROM growth_store_months() WHERE establishment_id = $1`, [EST])).rows
  assert.equal(m.reduce((acc, r) => acc + r.orders, 0), 2)
})

await test('postagens: colunas do tema existem (058)', async () => {
  await db.query(`INSERT INTO marketing_suggestions (establishment_id, day, headline, caption, push_title, push_body, provider, topic, topic_key, highlight)
    VALUES ($1, current_date, 'Cupom A', 'x', 'x', 'x', 'fregues', 'cupom', 'cupom:A', 'A')`, [EST])
  const r = (await db.query(`SELECT topic, highlight FROM marketing_suggestions`)).rows[0]
  assert.deepEqual(r, { topic: 'cupom', highlight: 'A' })
})

console.log(results.join('\n'))
console.log(`\n${passed}/${results.length} testes do crescimento passaram`)
if (passed !== results.length) process.exit(1)
