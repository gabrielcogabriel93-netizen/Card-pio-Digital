// Pizza dentro do combo com regras do lojista (migration 050).
import { createDb, as } from './harness.mjs'
import assert from 'node:assert/strict'

const OWNER = '00000000-0000-0000-0000-0000000000a1'
const EST = '10000000-0000-0000-0000-000000000001'
const SIZE = '60000000-0000-0000-0000-000000000001'
const COMBO = '70000000-0000-0000-0000-000000000001'
const G_PIZZA = '71000000-0000-0000-0000-000000000001'
const G_BEB = '71000000-0000-0000-0000-000000000002'
const P = { calabresa: '30000000-0000-0000-0000-00000000000a', camarao: '30000000-0000-0000-0000-00000000000b', chocolate: '30000000-0000-0000-0000-00000000000c', frango: '30000000-0000-0000-0000-00000000000d', refri: '30000000-0000-0000-0000-00000000000e' }
const BORDA = '62000000-0000-0000-0000-000000000001'
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
  INSERT INTO pizza_sizes (id, establishment_id, name, base_price, max_flavors) VALUES ('${SIZE}', '${EST}', 'Grande', 40, 3);
  INSERT INTO pizza_flavors (id, establishment_id, name, category) VALUES
    ('61000000-0000-0000-0000-000000000001', '${EST}', 'Calabresa', 'salgada'),
    ('61000000-0000-0000-0000-000000000002', '${EST}', 'Camarão', 'salgada'),
    ('61000000-0000-0000-0000-000000000003', '${EST}', 'Chocolate', 'doce'),
    ('61000000-0000-0000-0000-000000000004', '${EST}', 'Frango', 'salgada');
  INSERT INTO pizza_additionals (id, establishment_id, name) VALUES ('${BORDA}', '${EST}', 'Borda recheada');
  INSERT INTO pizza_additional_prices (additional_id, size_id, price) VALUES ('${BORDA}', '${SIZE}', 8);
  INSERT INTO products (id, establishment_id, name, price, track_stock, pizza_flavor_id) VALUES
    ('${P.calabresa}', '${EST}', 'Calabresa', 40, false, '61000000-0000-0000-0000-000000000001'),
    ('${P.camarao}', '${EST}', 'Camarão', 55, false, '61000000-0000-0000-0000-000000000002'),
    ('${P.chocolate}', '${EST}', 'Chocolate', 45, false, '61000000-0000-0000-0000-000000000003'),
    ('${P.frango}', '${EST}', 'Frango', 42, false, '61000000-0000-0000-0000-000000000004');
  INSERT INTO products (id, establishment_id, name, price, track_stock) VALUES ('${P.refri}', '${EST}', 'Refri 2L', 12, false);
  INSERT INTO combos (id, establishment_id, name, price) VALUES ('${COMBO}', '${EST}', 'Pizza + Refri', 59.9);
  INSERT INTO combo_groups (id, combo_id, name, display_order, is_pizza_slot, fixed_pizza_size_id) VALUES
    ('${G_PIZZA}', '${COMBO}', 'Pizza grande', 0, true, '${SIZE}'),
    ('${G_BEB}', '${COMBO}', 'Bebida', 1, false, NULL);
  INSERT INTO combo_group_products (combo_group_id, product_id) VALUES
    ('${G_PIZZA}', '${P.calabresa}'), ('${G_PIZZA}', '${P.frango}'), ('${G_PIZZA}', '${P.chocolate}'), ('${G_BEB}', '${P.refri}');
`)
const anon = (sql, params) => as(db, 'anon', null, sql, params)
const quote = async (pizzaSel) => (await anon(`SELECT quote_order_items($1, $2::jsonb) r`, [EST, JSON.stringify([{
  kind: 'combo', combo_id: COMBO, quantity: 1,
  selections: [{ group_id: G_PIZZA, ...pizzaSel }, { group_id: G_BEB, product_id: P.refri }],
}])])).rows[0].r[0]
const setRules = (max, adds) => db.exec(`UPDATE combo_groups SET pizza_max_flavors = ${max === null ? 'NULL' : max}, pizza_allow_additionals = ${adds} WHERE id = '${G_PIZZA}'`)

await test('combo antigo (1 sabor, sem regras novas) continua igual', async () => {
  const item = await quote({ product_id: P.calabresa })
  assert.equal(Number(item.unit_price), 59.9)
  assert.equal(item.variations[0].option_name, 'Calabresa')
})

await test('sem limite do lojista vale o do tamanho: meio a meio no mesmo preço', async () => {
  const item = await quote({ product_id: P.calabresa, flavor_product_ids: [P.frango, P.calabresa] })
  assert.equal(Number(item.unit_price), 59.9)
  assert.equal(item.variations[0].option_name, 'Calabresa + Frango')
})

await test('lojista limita a 1 sabor (promoção de sabor exclusivo)', async () => {
  await setRules(1, false)
  await assert.rejects(quote({ product_id: P.calabresa, flavor_product_ids: [P.frango] }), /até 1 sabor/)
  assert.equal(Number((await quote({ product_id: P.calabresa })).unit_price), 59.9)
})

await test('limite do lojista nunca passa o do tamanho', async () => {
  await setRules(4, false)
  await assert.rejects(quote({ product_id: P.calabresa, flavor_product_ids: [P.frango, P.chocolate, P.camarao] }), /até 3 sabor/)
})

await test('sabor fora da lista do combo é recusado', async () => {
  await setRules(null, false)
  await assert.rejects(quote({ product_id: P.calabresa, flavor_product_ids: [P.camarao] }), /inválida/)
})

await test('não mistura salgada com doce (mesma regra da pizza avulsa)', async () => {
  await assert.rejects(quote({ product_id: P.calabresa, flavor_product_ids: [P.chocolate] }), /inválida/)
})

await test('adicional só se o lojista liberar, e é cobrado à parte', async () => {
  await assert.rejects(quote({ product_id: P.calabresa, additional_ids: [BORDA] }), /não aceita adicionais/)
  await setRules(null, true)
  const item = await quote({ product_id: P.calabresa, flavor_product_ids: [P.frango], additional_ids: [BORDA] })
  assert.equal(Number(item.unit_price), 67.9)
  assert.ok(item.variations.some((v) => v.option_name === 'Borda recheada' && Number(v.price_delta) === 8))
})

await test('pedido de verdade grava o preço do servidor com sabores e adicional', async () => {
  const r = (await anon(`SELECT place_order($1::jsonb) r`, [JSON.stringify({
    establishment_id: EST, customer_name: 'Ana', customer_phone: '11988887777', order_type: 'pickup',
    items: [{ kind: 'combo', combo_id: COMBO, quantity: 2, selections: [
      { group_id: G_PIZZA, product_id: P.frango, flavor_product_ids: [P.calabresa], additional_ids: [BORDA] },
      { group_id: G_BEB, product_id: P.refri },
    ] }],
  })])).rows[0].r
  assert.equal(Number(r.total), 135.8)
})

console.log(results.join('\n'))
console.log(`\n${passed}/${results.length} testes da pizza no combo passaram`)
process.exit(passed === results.length ? 0 : 1)
