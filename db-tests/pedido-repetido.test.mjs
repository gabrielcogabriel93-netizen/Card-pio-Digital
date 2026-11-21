// Migration 062: envio repetido não duplica pedido; sabor desativado some do cardápio.
import { createDb, as } from './harness.mjs'
import assert from 'node:assert/strict'

const OWNER = '00000000-0000-0000-0000-0000000000a1'
const EST = '10000000-0000-0000-0000-000000000001'
const SIZE = '60000000-0000-0000-0000-000000000001'
const F = { calabresa: '61000000-0000-0000-0000-000000000001', siciliana: '61000000-0000-0000-0000-000000000002', brigadeiro: '61000000-0000-0000-0000-000000000003' }
const P = { calabresa: '30000000-0000-0000-0000-00000000000a', siciliana: '30000000-0000-0000-0000-00000000000b', refri: '30000000-0000-0000-0000-00000000000e' }
const REQ = '90000000-0000-0000-0000-000000000001'
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
  try { await promise } catch (e) { if (re && !re.test(e.message)) throw new Error(`erro inesperado: ${e.message}`); return }
  throw new Error('deveria ter falhado')
}

const db = await createDb()
await db.exec(`
  INSERT INTO auth.users VALUES ('${OWNER}', 'dono@x.com');
  INSERT INTO platform_settings (id, billing_enabled, monthly_price) VALUES (true, false, 49.9) ON CONFLICT (id) DO NOTHING;
  INSERT INTO establishments (id, owner_id, name, slug, whatsapp_number, opening_hours) VALUES ('${EST}', '${OWNER}', 'Mega', 'mega', '11999999999', NULL);
  INSERT INTO pizza_sizes (id, establishment_id, name, base_price, max_flavors) VALUES ('${SIZE}', '${EST}', 'Grande', 40, 2);
  INSERT INTO pizza_flavors (id, establishment_id, name, category) VALUES
    ('${F.calabresa}', '${EST}', 'Calabresa', 'salgada'),
    ('${F.siciliana}', '${EST}', 'Siciliana', 'salgada'),
    ('${F.brigadeiro}', '${EST}', 'Brigadeiro', 'doce');
  INSERT INTO products (id, establishment_id, name, price, track_stock, pizza_flavor_id) VALUES
    ('${P.calabresa}', '${EST}', 'Calabresa', 40, false, '${F.calabresa}'),
    ('${P.siciliana}', '${EST}', 'Siciliana', 45, false, '${F.siciliana}');
  INSERT INTO products (id, establishment_id, name, price, track_stock) VALUES ('${P.refri}', '${EST}', 'Refri 2L', 12, false);
`)
const anon = (sql, params) => as(db, 'anon', null, sql, params)
let phone = 0
// Telefone novo a cada pedido (o limite de pedidos por número não é o assunto aqui); o repetido usa o mesmo.
const place = async (payload, samePhone = false) => (await anon('SELECT place_order($1::jsonb) AS r', [JSON.stringify({ establishment_id: EST, customer_name: 'Ana', customer_phone: `1198888${String(samePhone ? phone : ++phone).padStart(4, '0')}`, order_type: 'pickup', ...payload })])).rows[0].r
const pizza = (product_id, flavor_ids = []) => ({ kind: 'pizza', product_id, quantity: 1, size_id: SIZE, flavor_ids, additional_ids: [] })
const count = async () => Number((await db.query('SELECT count(*) c FROM orders')).rows[0].c)

await test('envio repetido com o mesmo request_id devolve o mesmo pedido', async () => {
  const a = await place({ request_id: REQ, items: [{ kind: 'product', product_id: P.refri, quantity: 2 }] })
  const b = await place({ request_id: REQ, items: [{ kind: 'product', product_id: P.refri, quantity: 2 }] }, true)
  assert.equal(b.order_id, a.order_id)
  assert.equal(b.repeated, true)
  assert.equal(Number(b.total), 24)
  assert.equal(await count(), 1)
})

await test('envios diferentes (ou sem request_id) criam pedidos diferentes', async () => {
  const a = await place({ request_id: '90000000-0000-0000-0000-000000000002', items: [{ kind: 'product', product_id: P.refri, quantity: 1 }] })
  const b = await place({ items: [{ kind: 'product', product_id: P.refri, quantity: 1 }] })
  const c = await place({ request_id: 'lixo', items: [{ kind: 'product', product_id: P.refri, quantity: 1 }] })
  assert.notEqual(a.order_id, b.order_id)
  assert.notEqual(b.order_id, c.order_id)
  assert.equal(await count(), 4)
})

await test('sabor desativado: o produto some do cardápio e o pedido explica o motivo', async () => {
  const visible = async () => (await anon('SELECT name FROM public_products WHERE establishment_id = $1 ORDER BY name', [EST])).rows.map((r) => r.name)
  assert.deepEqual(await visible(), ['Calabresa', 'Refri 2L', 'Siciliana'])
  await db.exec(`UPDATE pizza_flavors SET is_active = false WHERE id = '${F.siciliana}'`)
  assert.deepEqual(await visible(), ['Calabresa', 'Refri 2L'])
  await rejects(place({ items: [pizza(P.siciliana)] }), /Siciliana não está disponível no momento/)
  await rejects(place({ items: [pizza(P.calabresa, [F.siciliana])] }), /Um dos sabores escolhidos para Calabresa não está mais disponível/)
  await db.exec(`UPDATE pizza_flavors SET is_active = true WHERE id = '${F.siciliana}'`)
  const ok = await place({ items: [pizza(P.calabresa, [F.siciliana])] })
  assert.equal(Number(ok.total), 40) // preço do tamanho (sem acréscimo de sabor)
})

await test('doce com salgado na mesma pizza tem mensagem clara', async () => {
  await rejects(place({ items: [pizza(P.calabresa, [F.brigadeiro])] }), /doce e salgado/)
})

await test('aviso de pedido: anônimo não apaga os de todo mundo; o cliente apaga o próprio', async () => {
  const o = await place({ items: [{ kind: 'product', product_id: P.refri, quantity: 1 }] })
  await db.query(`INSERT INTO order_push_subscriptions (order_id, endpoint, p256dh, auth) VALUES ($1, 'https://push/a', 'k', 'x'), ($1, 'https://push/b', 'k', 'x')`, [o.order_id])
  const cnt = async () => Number((await db.query('SELECT count(*) c FROM order_push_subscriptions')).rows[0].c)
  await anon('DELETE FROM order_push_subscriptions').catch(() => {})
  assert.equal(await cnt(), 2)
  await anon('SELECT remove_order_push_subscription($1, $2)', [o.order_id, 'https://push/a'])
  assert.equal(await cnt(), 1)
})

console.log(results.join('\n'))
console.log(`\n${passed}/${results.length} testes de pedido repetido e sabor desativado passaram`)
if (passed !== results.length) process.exit(1)
