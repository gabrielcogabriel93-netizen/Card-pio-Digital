// Estado de transição: 044 e 045 aplicadas, 046 ainda NÃO. É o momento
// entre rodar o SQL e o deploy do app novo ficar no ar: o app antigo
// precisa continuar funcionando e o novo também.
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

const db = await createDb({ upTo: 45 })
await db.exec(`
  INSERT INTO auth.users VALUES ('${OWNER}', 'dono@x.com');
  INSERT INTO platform_settings (id, billing_enabled, monthly_price) VALUES (true, false, 49.9) ON CONFLICT (id) DO NOTHING;
  INSERT INTO establishments (id, owner_id, name, slug, whatsapp_number) VALUES ('${EST}', '${OWNER}', 'Loja', 'loja', '11999999999');
  INSERT INTO products (id, establishment_id, name, price, track_stock) VALUES ('30000000-0000-0000-0000-000000000001', '${EST}', 'X', 20, false);
`)
const anon = (sql, params) => as(db, 'anon', null, sql, params)

await test('app antigo: pedido direto na tabela ainda funciona (até a 046)', async () => {
  await anon(`INSERT INTO orders (establishment_id, customer_name, customer_phone, items, subtotal, total)
    VALUES ('${EST}', 'Ana', '(11) 98888-7777', '[{"product_id":"30000000-0000-0000-0000-000000000001","quantity":1}]', 20, 20)`)
})

await test('app antigo: funções de cliente com 2 parâmetros continuam existindo', async () => {
  await anon(`SELECT * FROM get_customer_profile($1, $2)`, [EST, '11988887777'])
  await anon(`SELECT * FROM get_orders_by_phone($1, $2)`, [EST, '11988887777'])
})

await test('app novo: place_order e funções com token já funcionam', async () => {
  const r = (await anon(`SELECT place_order($1::jsonb) r`, [JSON.stringify({ establishment_id: EST, customer_name: 'Bia', customer_phone: '11977776666', order_type: 'pickup', items: [{ kind: 'product', product_id: '30000000-0000-0000-0000-000000000001', quantity: 2 }] })])).rows[0].r
  assert.equal(Number(r.total), 40)
  const p = (await anon(`SELECT * FROM get_customer_profile($1, $2, $3)`, [EST, '11977776666', r.customer_token])).rows[0]
  assert.equal(p.verified, true)
})

await test('logs: navegador anônimo grava erro com nível e origem', async () => {
  await anon(`INSERT INTO error_logs (scope, message, level, source) VALUES ('teste', 'falhou', 'critical', 'navegador')`)
  const row = (await db.query(`SELECT level, source FROM error_logs WHERE scope = 'teste'`)).rows[0]
  assert.deepEqual(row, { level: 'critical', source: 'navegador' })
})

const full = await createDb()
await test('depois da 046: pedido direto e funções antigas ficam fechados', async () => {
  await full.exec(`INSERT INTO auth.users VALUES ('${OWNER}', 'dono@x.com');
    INSERT INTO establishments (id, owner_id, name, slug, whatsapp_number) VALUES ('${EST}', '${OWNER}', 'Loja', 'loja', '11999999999');`)
  await assert.rejects(as(full, 'anon', null, `INSERT INTO orders (establishment_id, customer_name, customer_phone, items, subtotal, total) VALUES ('${EST}', 'A', '1', '[]', 1, 1)`), /row-level security/)
  await assert.rejects(as(full, 'anon', null, `SELECT * FROM get_customer_profile($1, $2)`, [EST, '11988887777']), /does not exist/)
})

console.log(results.join('\n'))
console.log(`\n${passed}/${results.length} testes de transição passaram`)
process.exit(passed === results.length ? 0 : 1)
