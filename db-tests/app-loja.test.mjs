// App da loja e notificações (migration 049).
import { createDb, as } from './harness.mjs'
import assert from 'node:assert/strict'

const OWNER = '00000000-0000-0000-0000-0000000000a1'
const OTHER = '00000000-0000-0000-0000-0000000000b2'
const EST = '10000000-0000-0000-0000-000000000001'
const PROD = '30000000-0000-0000-0000-000000000001'
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
await db.exec(`
  INSERT INTO auth.users VALUES ('${OWNER}', 'dono@x.com'), ('${OTHER}', 'outro@x.com');
  INSERT INTO platform_settings (id, billing_enabled, monthly_price) VALUES (true, false, 49.9) ON CONFLICT (id) DO NOTHING;
  INSERT INTO establishments (id, owner_id, name, slug, whatsapp_number) VALUES ('${EST}', '${OWNER}', 'Loja', 'loja', '11999999999');
  INSERT INTO products (id, establishment_id, name, price, track_stock) VALUES ('${PROD}', '${EST}', 'X', 20, false);
`)
const anon = (sql, params) => as(db, 'anon', null, sql, params)
const owner = (sql, params) => as(db, 'authenticated', OWNER, sql, params)
const other = (sql, params) => as(db, 'authenticated', OTHER, sql, params)
const resetLimits = () => db.exec(`DELETE FROM rate_limit_hits`)
const KEY = (n) => `aparelho-${n}-aaaaaaaaaaaaaaaaaaaa`
const EP = (n) => `https://fcm.googleapis.com/fcm/send/aparelho-${n}-xxxxxxxxxxxx`
const register = (n, extra = {}) => anon(
  `SELECT register_customer_device($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
  [EST, KEY(n), extra.noPush ? null : EP(n), 'p', 'a', extra.installed ?? false, 'android', extra.phone ?? null, extra.token ?? null, extra.name ?? null]
)
const device = async (n, cols) => (await db.query(`SELECT ${cols} FROM customer_devices WHERE device_key = $1`, [KEY(n)])).rows[0]

const order = (await anon(`SELECT place_order($1::jsonb) r`, [JSON.stringify({
  establishment_id: EST, customer_name: 'Ana', customer_phone: '(11) 98888-7777', order_type: 'pickup',
  items: [{ kind: 'product', product_id: PROD, quantity: 1 }],
})])).rows[0].r
const token = order.customer_token
const orderCode = order.order_id.replace(/-/g, '').slice(0, 6)

await test('aparelho com token do cliente fica ligado ao telefone', async () => {
  await register(1, { phone: '11988887777', token, name: 'Ana', installed: true })
  assert.deepEqual(await device(1, 'customer_phone, customer_name, installed, notifications_enabled'), { customer_phone: '11988887777', customer_name: 'Ana', installed: true, notifications_enabled: true })
})

await test('sem token (ou token errado) o aparelho entra, mas sem telefone', async () => {
  await register(2, { phone: '11988887777', token: 'errado' })
  assert.equal((await device(2, 'customer_phone')).customer_phone, null)
})

await test('instalar sem notificação e ativar depois soma no mesmo aparelho', async () => {
  await register(3, { noPush: true, installed: true })
  assert.deepEqual(await device(3, 'installed, notifications_enabled, endpoint'), { installed: true, notifications_enabled: false, endpoint: null })
  await register(3, { installed: false })
  assert.deepEqual(await device(3, 'installed, notifications_enabled'), { installed: true, notifications_enabled: true })
  // Visita seguinte sem mexer em avisos não apaga o endereço de envio.
  await register(3, { noPush: true })
  assert.equal((await device(3, 'endpoint')).endpoint, EP(3))
})

await test('desativar remove as chaves de envio', async () => {
  await anon(`SELECT unregister_customer_device($1, $2)`, [EST, KEY(3)])
  assert.deepEqual(await device(3, 'notifications_enabled, endpoint, p256dh'), { notifications_enabled: false, endpoint: null, p256dh: null })
})

await test('endereço de envio precisa ser https', async () => {
  await assert.rejects(anon(`SELECT register_customer_device($1, $2, $3, 'p', 'a', false, 'android')`, [EST, KEY(9), 'http://evil.example/x']), /inválido/)
})

await test('só o dono vê os aparelhos da loja', async () => {
  assert.equal((await owner(`SELECT count(*)::int c FROM customer_devices`)).rows[0].c, 3)
  assert.equal((await other(`SELECT count(*)::int c FROM customer_devices`)).rows[0].c, 0)
  await assert.rejects(anon(`SELECT * FROM customer_devices`), /permission denied/)
})

await test('aparelho novo confirma com o número do pedido', async () => {
  await resetLimits()
  const t = (await anon(`SELECT verify_customer_by_order($1, $2, $3) t`, [EST, '(11) 98888-7777', '#' + orderCode.toUpperCase()])).rows[0].t
  assert.ok(t && t.length > 20)
  const p = (await anon(`SELECT * FROM get_customer_profile($1, $2, $3)`, [EST, '11988887777', t])).rows[0]
  assert.equal(p.verified, true)
})

await test('número errado ou de outro telefone não confirma, e há limite de tentativas', async () => {
  await resetLimits()
  const tok = async (phone, code) => (await anon(`SELECT verify_customer_by_order($1, $2, $3) t`, [EST, phone, code])).rows[0].t
  assert.equal(await tok('11988887777', 'ffffff'), null)
  assert.equal(await tok('11977776666', orderCode), null)
  // 5 tentativas por telefone a cada 15 min: a 6ª é barrada mesmo com o número certo.
  for (let i = 0; i < 4; i++) assert.equal(await tok('11988887777', 'eeeeee'), null)
  await assert.rejects(anon(`SELECT verify_customer_by_order($1, $2, $3)`, [EST, '11988887777', orderCode]), /Muitas tentativas/)
})

await test('clique só é contado pelo servidor; dono vê só as campanhas da loja', async () => {
  const id = (await db.query(`INSERT INTO push_campaigns (establishment_id, title, body, audience) VALUES ($1, 'Oi', 'Promo', 'all') RETURNING id`, [EST])).rows[0].id
  await assert.rejects(anon(`SELECT register_push_click($1)`, [id]), /permission denied/)
  await as(db, 'service_role', null, `SELECT register_push_click($1)`, [id])
  assert.equal((await db.query(`SELECT click_count FROM push_campaigns WHERE id = $1`, [id])).rows[0].click_count, 1)
  assert.equal((await other(`SELECT count(*)::int c FROM push_campaigns`)).rows[0].c, 0)
  assert.equal((await owner(`SELECT count(*)::int c FROM push_campaigns`)).rows[0].c, 1)
})

console.log(results.join('\n'))
console.log(`\n${passed}/${results.length} testes do app da loja passaram`)
process.exit(passed === results.length ? 0 : 1)
