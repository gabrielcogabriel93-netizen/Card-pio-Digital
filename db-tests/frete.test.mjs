// Frete grátis só quando o lojista escolhe (migration 055).
import { createDb, as } from './harness.mjs'
import assert from 'node:assert/strict'

const OWNER = '00000000-0000-0000-0000-0000000000a1'
const EST = '10000000-0000-0000-0000-000000000001'
const PROD = '30000000-0000-0000-0000-000000000001'
const NEIGH = '80000000-0000-0000-0000-000000000001'
const results = []
let passed = 0
let phone = 11970000000
async function test(name, fn) {
  try {
    await db.exec(`DELETE FROM rate_limit_hits;`)
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
await db.exec(`
  INSERT INTO auth.users VALUES ('${OWNER}', 'dono@x.com');
  INSERT INTO platform_settings (id, billing_enabled, monthly_price) VALUES (true, false, 49.9) ON CONFLICT (id) DO NOTHING;
  INSERT INTO establishments (id, owner_id, name, slug, whatsapp_number, delivery_fee, plan_tier, opening_hours)
  VALUES ('${EST}', '${OWNER}', 'Loja', 'loja', '11999999999', 0, 'completo', NULL);
  INSERT INTO products (id, establishment_id, name, price, track_stock) VALUES ('${PROD}', '${EST}', 'Pizza', 40, false);
  INSERT INTO delivery_neighborhoods (id, establishment_id, name, fee, is_active) VALUES ('${NEIGH}', '${EST}', 'Centro', 0, true);
  INSERT INTO coupons (establishment_id, code, discount_type, discount_value, is_active) VALUES ('${EST}', 'FRETE', 'free_shipping', 0, true);
  INSERT INTO mercadopago_accounts (establishment_id, mp_user_id, access_token, refresh_token, expires_at, is_active)
    VALUES ('${EST}', '1', 'a', 'b', now() + interval '1 day', true);
`)
const owner = (sql, params) => as(db, 'authenticated', OWNER, sql, params)
const service = (sql, params) => as(db, 'service_role', null, sql, params)
const setEst = (sql) => db.exec(`UPDATE establishments SET ${sql} WHERE id = '${EST}'`)
const place = async (extra = {}) => (await as(db, 'anon', null, 'SELECT place_order($1::jsonb) AS r', [JSON.stringify({
  establishment_id: EST, customer_name: 'Ana', customer_phone: String(++phone), order_type: 'delivery', payment_method: 'dinheiro',
  delivery_address: { street: 'Rua A', number: '10', neighborhood: 'Centro', ...(extra.address || {}) },
  items: [{ kind: 'product', product_id: PROD, quantity: extra.qty || 1 }],
  ...extra,
})])).rows[0].r
const row = async (id) => (await db.query('SELECT * FROM orders WHERE id = $1', [id])).rows[0]

await test('taxa 0 sem marcar "grátis" vira taxa a combinar, não frete grátis', async () => {
  const r = await place()
  assert.equal(Number(r.shipping_fee), 0)
  assert.equal(r.shipping_fee_to_confirm, true)
  assert.equal((await row(r.order_id)).shipping_fee_to_confirm, true)
})

await test('automação não aceita pedido com taxa a combinar', async () => {
  const r = await place()
  const o = (await service(`SELECT service_accept_order($1, 'confirmed') o`, [r.order_id])).rows[0].o
  assert.equal(o, null)
  assert.equal((await row(r.order_id)).status, 'pending')
})

await test('aceite sem informar a taxa é recusado; com a taxa, soma no total', async () => {
  const r = await place()
  await rejects(owner(`SELECT accept_order($1, 'confirmed')`, [r.order_id]), /taxa de entrega/)
  await owner(`SELECT accept_order($1, 'confirmed', 7)`, [r.order_id])
  const o = await row(r.order_id)
  assert.equal(Number(o.shipping_fee), 7)
  assert.equal(Number(o.total), 47)
  assert.equal(o.shipping_fee_to_confirm, false)
  const fin = (await db.query(`SELECT amount FROM financial_entries WHERE order_id = $1 AND type = 'income'`, [r.order_id])).rows[0]
  assert.equal(Number(fin.amount), 47)
})

await test('lojista pode decidir não cobrar no aceite (digita 0)', async () => {
  const r = await place()
  await owner(`SELECT accept_order($1, 'confirmed', 0)`, [r.order_id])
  assert.equal(Number((await row(r.order_id)).total), 40)
})

await test('Pix automático não é aceito com a taxa a combinar', async () => {
  await rejects(place({ payment_method: 'mercadopago_pix' }), /combinada depois/)
})

await test('"Entrega grátis" marcada pelo lojista: sem taxa e sem pendência', async () => {
  await setEst('free_delivery = true')
  const r = await place()
  assert.equal(Number(r.shipping_fee), 0)
  assert.equal(r.shipping_fee_to_confirm, false)
  await setEst('free_delivery = false')
})

await test('taxa fixa é cobrada', async () => {
  await setEst('delivery_fee = 6')
  const r = await place()
  assert.equal(Number(r.shipping_fee), 6)
  assert.equal(Number(r.total), 46)
  assert.equal(r.shipping_fee_to_confirm, false)
  await setEst('delivery_fee = 0')
})

await test('frete grátis por valor mínimo, cupom e bairro com taxa 0 continuam (escolhas do lojista)', async () => {
  await setEst('free_shipping_threshold = 70')
  const byThreshold = await place({ qty: 2 })
  assert.equal(byThreshold.shipping_fee_to_confirm, false)
  assert.equal(Number(byThreshold.shipping_fee), 0)
  const below = await place({ qty: 1 })
  assert.equal(below.shipping_fee_to_confirm, true)
  await setEst('free_shipping_threshold = NULL')

  const byCoupon = await place({ coupon_code: 'FRETE' })
  assert.equal(byCoupon.shipping_fee_to_confirm, false)

  await setEst('use_neighborhood_delivery_fee = true')
  const byNeigh = await place({ address: { neighborhood_id: NEIGH } })
  assert.equal(byNeigh.shipping_fee_to_confirm, false)
  assert.equal(Number(byNeigh.shipping_fee), 0)
  await setEst('use_neighborhood_delivery_fee = false')
})

await test('Pix automático já pago: a taxa não muda no aceite', async () => {
  await setEst('delivery_fee = 5')
  const r = await place({ payment_method: 'mercadopago_pix' })
  await db.query(`UPDATE orders SET payment_status = 'approved' WHERE id = $1`, [r.order_id])
  await owner(`SELECT accept_order($1, 'confirmed', 12)`, [r.order_id])
  const o = await row(r.order_id)
  assert.equal(Number(o.shipping_fee), 5)
  assert.equal(Number(o.total), 45)
  await setEst('delivery_fee = 0')
})

await test('página do pedido e cardápio recebem os campos novos', async () => {
  const r = await place()
  const s = (await as(db, 'anon', null, `SELECT shipping_fee_to_confirm FROM get_order_status($1)`, [r.order_id])).rows[0]
  assert.equal(s.shipping_fee_to_confirm, true)
  const e = (await as(db, 'anon', null, `SELECT free_delivery FROM public_establishments WHERE id = $1`, [EST])).rows[0]
  assert.equal(e.free_delivery, false)
})

console.log(results.join('\n'))
console.log(`\n${passed}/${results.length} testes do frete passaram`)
if (passed !== results.length) process.exit(1)
