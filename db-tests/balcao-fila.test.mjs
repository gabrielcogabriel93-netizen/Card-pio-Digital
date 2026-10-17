// Venda de balcão na fila de pedidos (migration 047).
import { createDb, as } from './harness.mjs'
import assert from 'node:assert/strict'

const OWNER = '00000000-0000-0000-0000-0000000000a1'
const EST = '10000000-0000-0000-0000-000000000001'
const PROD = '30000000-0000-0000-0000-000000000009'
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
  INSERT INTO products (id, establishment_id, name, price, track_stock, stock_qty) VALUES ('${PROD}', '${EST}', 'Lanche', 20, true, 10);
`)
const owner = (sql, params) => as(db, 'authenticated', OWNER, sql, params)
const sale = async (extra = {}) => (await owner(`SELECT balcao_sale($1::jsonb) id`, [JSON.stringify({
  establishment_id: EST, payment_method: 'dinheiro',
  items: [{ product_id: PROD, product_name: 'Lanche', quantity: 1, unit_price: 20, total_price: 20, variations: [] }],
  ...extra,
})])).rows[0].id
const row = async (id) => (await db.query('SELECT * FROM orders WHERE id = $1', [id])).rows[0]
const stock = async () => (await db.query(`SELECT stock_qty FROM products WHERE id = '${PROD}'`)).rows[0].stock_qty
const income = async (id) => (await db.query(`SELECT count(*)::int c FROM financial_entries WHERE order_id = $1 AND type = 'income'`, [id])).rows[0].c

await test('sem a opção (app antigo): continua concluída na hora', async () => {
  const id = await sale()
  const o = await row(id)
  assert.equal(o.status, 'completed')
  assert.ok(o.completed_at)
  assert.equal(await income(id), 1)
  assert.equal(await stock(), 9)
})

await test('com etapas ligadas: vai para "Em preparo" já com estoque e financeiro', async () => {
  const id = await sale({ send_to_kitchen: true })
  const o = await row(id)
  assert.equal(o.status, 'preparing')
  assert.ok(o.accepted_at)
  assert.equal(o.completed_at, null)
  assert.equal(await income(id), 1)
  assert.equal(await stock(), 8)
  const done = (await owner(`SELECT (advance_order($1, 'completed')).status s`, [id])).rows[0].s
  assert.equal(done, 'completed')
  assert.equal(await stock(), 8)
})

await test('com etapas desligadas: entra em "Novos" e baixa só no aceite (sem duplicar)', async () => {
  await db.exec(`UPDATE establishments SET order_tracking_enabled = false WHERE id = '${EST}'`)
  const id = await sale({ send_to_kitchen: true })
  assert.equal((await row(id)).status, 'pending')
  assert.equal(await income(id), 0)
  assert.equal(await stock(), 8)
  await owner(`SELECT accept_order($1, 'completed')`, [id])
  assert.equal((await row(id)).status, 'completed')
  assert.equal(await income(id), 1)
  assert.equal(await stock(), 7)
})

await test('cancelar da fila devolve o estoque', async () => {
  await db.exec(`UPDATE establishments SET order_tracking_enabled = true WHERE id = '${EST}'`)
  const id = await sale({ send_to_kitchen: true })
  assert.equal(await stock(), 6)
  await owner(`SELECT cancel_order($1, 'cliente desistiu')`, [id])
  assert.equal(await stock(), 7)
  assert.equal(await income(id), 0)
})

console.log(results.join('\n'))
console.log(`\n${passed}/${results.length} testes do balcão na fila passaram`)
process.exit(passed === results.length ? 0 : 1)
