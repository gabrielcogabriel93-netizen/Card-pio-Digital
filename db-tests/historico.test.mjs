// Histórico de pedidos em qualquer aparelho (migration 053).
import { createDb, as } from './harness.mjs'
import assert from 'node:assert/strict'

const OWNER = '00000000-0000-0000-0000-0000000000a1'
const EST = '10000000-0000-0000-0000-000000000001'
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
  INSERT INTO auth.users VALUES ('${OWNER}', 'dono@x.com');
  INSERT INTO platform_settings (id, billing_enabled, monthly_price) VALUES (true, false, 49.9) ON CONFLICT (id) DO NOTHING;
  INSERT INTO establishments (id, owner_id, name, slug, whatsapp_number) VALUES ('${EST}', '${OWNER}', 'Loja', 'loja', '11999999999');
  INSERT INTO products (id, establishment_id, name, price, track_stock) VALUES
    ('30000000-0000-0000-0000-000000000001', '${EST}', 'X-Bacon', 32, false),
    ('30000000-0000-0000-0000-000000000002', '${EST}', 'Batata', 18, false),
    ('30000000-0000-0000-0000-000000000003', '${EST}', 'Refri', 6, false),
    ('30000000-0000-0000-0000-000000000004', '${EST}', 'Milkshake', 20, false),
    ('30000000-0000-0000-0000-000000000005', '${EST}', 'Salada', 25, false);
`)
const anon = (sql, params) => as(db, 'anon', null, sql, params)
const reset = () => db.exec(`DELETE FROM rate_limit_hits; DELETE FROM customer_challenges;`)
const PHONE = '11988887777'

const order = (await anon(`SELECT place_order($1::jsonb) r`, [JSON.stringify({
  establishment_id: EST, customer_name: 'Ana', customer_phone: '(11) 98888-7777', order_type: 'pickup',
  items: [{ kind: 'product', product_id: '30000000-0000-0000-0000-000000000001', quantity: 2 }],
})])).rows[0].r
const fullToken = order.customer_token
const start = async (phone = PHONE) => (await anon(`SELECT start_customer_challenge($1, $2) c`, [EST, phone])).rows[0].c
const answer = async (id, item, total) => (await anon(`SELECT answer_customer_challenge($1, $2, $3) t`, [id, item, total])).rows[0].t

await test('pergunta tem 4 itens e 4 valores, com a resposta certa entre eles', async () => {
  await reset()
  const c = await start()
  assert.equal(c.items.length, 4)
  assert.equal(c.totals.length, 4)
  assert.ok(c.items.includes('X-Bacon'))
  assert.ok(c.totals.includes('R$ 64,00'))
  assert.equal(new Set(c.totals).size, 4)
})

await test('acertando as duas, o aparelho vê o histórico (mas não endereços nem perfil)', async () => {
  await reset()
  const c = await start()
  const token = await answer(c.challenge_id, 'x-bacon ', 'R$ 64,00')
  assert.ok(token && token.length > 30)
  const orders = (await anon(`SELECT * FROM get_orders_by_phone($1, $2, $3)`, [EST, PHONE, token])).rows
  assert.equal(orders.length, 1)
  const profile = (await anon(`SELECT * FROM get_customer_profile($1, $2, $3)`, [EST, PHONE, token])).rows[0]
  assert.notEqual(profile?.verified, true)
  await assert.rejects(anon(`SELECT upsert_customer_profile($1, $2, $3, $4, $5)`, [EST, PHONE, 'Ana', '1990-01-01', token]))
})

await test('errou: não libera e a mesma pergunta não vale de novo', async () => {
  await reset()
  const c = await start()
  assert.equal(await answer(c.challenge_id, 'X-Bacon', 'R$ 1,00'), null)
  await assert.rejects(answer(c.challenge_id, 'X-Bacon', 'R$ 64,00'), /expiraram/)
})

await test('no máximo 3 desafios por telefone em 24 horas', async () => {
  await reset()
  for (let i = 0; i < 3; i++) await start()
  await db.exec(`DELETE FROM rate_limit_hits`)
  await assert.rejects(start(), /3 vezes hoje/)
})

await test('telefone sem pedido não recebe pergunta', async () => {
  await reset()
  assert.equal(await start('11900001111'), null)
})

await test('token completo continua valendo para histórico e perfil', async () => {
  const orders = (await anon(`SELECT * FROM get_orders_by_phone($1, $2, $3)`, [EST, PHONE, fullToken])).rows
  assert.equal(orders.length, 1)
  const profile = (await anon(`SELECT * FROM get_customer_profile($1, $2, $3)`, [EST, PHONE, fullToken])).rows[0]
  assert.equal(profile.verified, true)
})

console.log(results.join('\n'))
console.log(`\n${passed}/${results.length} testes do histórico passaram`)
process.exit(passed === results.length ? 0 : 1)
