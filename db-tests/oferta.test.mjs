// Oferta configurável e campanhas com link (migration 059).
import { createDb, as } from './harness.mjs'
import assert from 'node:assert/strict'

const results = []
let passed = 0
async function test(name, fn) {
  try {
    await fn()
    passed++
    results.push(`  ok  ${name}`)
  } catch (e) {
    results.push(`FALHA ${name}\n      ${e.message}`)
  }
}

const db = await createDb()
await db.exec(`INSERT INTO platform_settings (id, billing_enabled, monthly_price) VALUES (true, true, 49.9) ON CONFLICT (id) DO UPDATE SET billing_enabled = true;`)

let n = 0
// Loja criada pelo navegador (papel authenticated), como no cadastro.
async function createStore(extra = {}) {
  const uid = `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}`
  await db.query(`INSERT INTO auth.users VALUES ($1, $2)`, [uid, `dono${n}@x.com`])
  const cols = { owner_id: uid, name: `Loja ${n}`, slug: `loja-${n}`, whatsapp_number: '11999998888', ...extra }
  const keys = Object.keys(cols)
  await as(db, 'authenticated', uid, `INSERT INTO establishments (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')})`, Object.values(cols))
  return (await db.query(`SELECT *, round(extract(epoch FROM trial_ends_at - created_at) / 86400) AS dias FROM establishments WHERE owner_id = $1`, [uid])).rows[0]
}
const offer = async (code = null) => (await as(db, 'anon', null, `SELECT get_signup_offer($1) o`, [code])).rows[0].o

await test('padrão depois da migration: teste desligado (site não promete dias grátis)', async () => {
  assert.equal((await offer()).trial_days, 0)
  await db.exec(`UPDATE platform_settings SET trial_enabled = true`)
  const o = await offer()
  assert.equal(o.trial_days, 30)
  assert.equal(o.campaign_code, null)
  assert.equal(Number((await createStore()).dias), 30)
})

await test('admin muda o prazo para 14 dias: site e novos cadastros acompanham', async () => {
  await db.exec(`UPDATE platform_settings SET trial_days = 14`)
  assert.equal((await offer()).trial_days, 14)
  assert.equal(Number((await createStore()).dias), 14)
})

await test('teste desligado: oferta sem dias e loja já nasce pedindo o plano', async () => {
  await db.exec(`UPDATE platform_settings SET trial_enabled = false`)
  assert.equal((await offer()).trial_days, 0)
  const s = await createStore()
  assert.equal(Number(s.dias), 0)
  const blocked = (await as(db, 'authenticated', s.owner_id, `SELECT blocked FROM get_my_subscription_status()`)).rows[0].blocked
  assert.equal(blocked, true)
})

await test('campanha do parceiro: cobra desde o início, com desconto, mesmo com o teste do site ligado', async () => {
  await db.exec(`UPDATE platform_settings SET trial_enabled = true, trial_days = 30;
    INSERT INTO signup_campaigns (code, name, trial_days, discount_percent, discount_months) VALUES ('parceria-joao', 'Parceria João', 0, 20, 3)`)
  const o = await offer('Parceria-Joao')
  assert.deepEqual([o.trial_days, o.campaign_name, o.discount_percent, o.discount_months], [0, 'Parceria João', 20, 3])
  const s = await createStore({ signup_campaign: 'parceria-joao' })
  assert.equal(s.signup_campaign, 'parceria-joao')
  assert.equal(Number(s.dias), 0)
  const mine = (await as(db, 'authenticated', s.owner_id, `SELECT get_my_signup_campaign() c`)).rows[0].c
  assert.equal(mine.discount_percent, 20)
})

await test('Black Friday com prazo: fora do período, o link cai na oferta normal', async () => {
  await db.exec(`INSERT INTO signup_campaigns (code, name, trial_days, starts_at, ends_at) VALUES
    ('black-friday', 'Black Friday', 60, now() - interval '1 day', now() + interval '1 day'),
    ('natal', 'Natal', 45, now() + interval '20 days', NULL),
    ('velha', 'Velha', 90, NULL, now() - interval '1 day')`)
  assert.equal((await offer('black-friday')).trial_days, 60)
  assert.equal((await offer('natal')).campaign_code, null)
  assert.equal((await offer('velha')).trial_days, 30)
  const s = await createStore({ signup_campaign: 'velha' })
  assert.equal(s.signup_campaign, null, 'campanha vencida não fica na loja')
  assert.equal(Number(s.dias), 30)
})

await test('desativar a campanha corta a oferta; código inventado é ignorado', async () => {
  await db.exec(`UPDATE signup_campaigns SET is_active = false WHERE code = 'black-friday'`)
  assert.equal((await offer('black-friday')).trial_days, 30)
  const s = await createStore({ signup_campaign: 'nao-existe' })
  assert.equal(s.signup_campaign, null)
})

await test('navegador não consegue criar loja já "isenta", "paga" ou com prazo próprio', async () => {
  const s = await createStore({ subscription_status: 'exempt', plan_tier: 'completo', trial_ends_at: '2099-01-01T00:00:00Z' })
  assert.equal(s.subscription_status, 'trial')
  assert.equal(s.plan_tier, 'essencial')
  assert.equal(Number(s.dias), 30)
})

await test('lojista não troca a campanha de origem depois', async () => {
  const s = await createStore()
  await as(db, 'authenticated', s.owner_id, `UPDATE establishments SET signup_campaign = 'parceria-joao' WHERE id = $1`, [s.id])
  assert.equal((await db.query(`SELECT signup_campaign FROM establishments WHERE id = $1`, [s.id])).rows[0].signup_campaign, null)
})

await test('tabela de campanhas fechada para visitante e lojista', async () => {
  assert.equal((await as(db, 'anon', null, `SELECT count(*)::int c FROM signup_campaigns`)).rows[0].c, 0)
  await assert.rejects(as(db, 'anon', null, `SELECT active_signup_campaign('parceria-joao')`), /permission|denied/i)
})

console.log(results.join('\n'))
console.log(`\n${passed}/${results.length} testes da oferta passaram`)
if (passed !== results.length) process.exit(1)
