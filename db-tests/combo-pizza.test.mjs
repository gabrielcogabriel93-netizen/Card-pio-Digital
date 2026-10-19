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

await test('regra do combo vale por si, mesmo acima do tamanho (migration 052)', async () => {
  // Tamanho aceita 3; o lojista libera 4 no combo. Sabores precisam estar na lista e combinar.
  await db.exec(`INSERT INTO combo_group_products (combo_group_id, product_id) VALUES ('${G_PIZZA}', '${P.camarao}') ON CONFLICT DO NOTHING`)
  await db.exec(`UPDATE pizza_sizes SET max_flavors = 2 WHERE id = '${SIZE}'`)
  await setRules(3, false)
  const item = await quote({ product_id: P.calabresa, flavor_product_ids: [P.frango, P.camarao] })
  assert.equal(item.variations[0].option_name, 'Calabresa + Camarão + Frango')
  await assert.rejects(quote({ product_id: P.calabresa, flavor_product_ids: [P.frango, P.camarao, P.chocolate] }), /até 3 sabor/)
  await db.exec(`UPDATE pizza_sizes SET max_flavors = 3 WHERE id = '${SIZE}'; DELETE FROM combo_group_products WHERE combo_group_id = '${G_PIZZA}' AND product_id = '${P.camarao}'`)
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

// ---- save_combo: cadastro do combo inteiro de uma vez ----
const save = async (payload) => (await as(db, 'authenticated', OWNER, `SELECT save_combo($1::jsonb) id`, [JSON.stringify(payload)])).rows[0].id

await test('salva combo novo com pizza meio a meio e bebida numa vez só', async () => {
  const id = await save({
    name: 'Promo Meio a Meio', price: 69.9, is_active: true,
    groups: [
      { name: 'Pizza grande', is_pizza_slot: true, fixed_pizza_size_id: SIZE, pizza_max_flavors: 2, pizza_allow_additionals: true, product_ids: [P.calabresa, P.frango] },
      { name: 'Bebida', is_pizza_slot: false, product_ids: [P.refri] },
    ],
  })
  const groups = (await db.query(`SELECT name, is_pizza_slot, pizza_max_flavors, pizza_allow_additionals, (SELECT count(*)::int FROM combo_group_products p WHERE p.combo_group_id = g.id) n FROM combo_groups g WHERE combo_id = $1 ORDER BY display_order`, [id])).rows
  assert.deepEqual(groups, [
    { name: 'Pizza grande', is_pizza_slot: true, pizza_max_flavors: 2, pizza_allow_additionals: true, n: 2 },
    { name: 'Bebida', is_pizza_slot: false, pizza_max_flavors: null, pizza_allow_additionals: false, n: 1 },
  ])
  // Edita: troca a bebida por nada, mantém o id da pizza, tira um sabor.
  const pizzaId = (await db.query(`SELECT id FROM combo_groups WHERE combo_id = $1 AND is_pizza_slot`, [id])).rows[0].id
  await save({ id, name: 'Promo Meio a Meio', price: 59.9, is_active: true, groups: [
    { id: pizzaId, name: 'Pizza grande', is_pizza_slot: true, fixed_pizza_size_id: SIZE, pizza_max_flavors: 3, product_ids: [P.frango] },
  ] })
  const after = (await db.query(`SELECT id, pizza_max_flavors FROM combo_groups WHERE combo_id = $1`, [id])).rows
  assert.deepEqual(after, [{ id: pizzaId, pizza_max_flavors: 3 }])
  assert.equal(Number((await db.query('SELECT price FROM combos WHERE id = $1', [id])).rows[0].price), 59.9)
})

await test('não deixa ficar disponível incompleto, e nada fica salvo pela metade', async () => {
  await assert.rejects(save({ name: 'Vazio', price: 10, is_active: true, groups: [] }), /pelo menos uma parte/)
  await assert.rejects(save({ name: 'Sem sabor', price: 10, is_active: true, groups: [{ name: 'Pizza', is_pizza_slot: true, fixed_pizza_size_id: SIZE, product_ids: [] }] }), /Marque pelo menos uma opção/)
  await assert.rejects(save({ name: 'Sem tamanho', price: 10, is_active: false, groups: [{ name: 'Pizza', is_pizza_slot: true, product_ids: [P.calabresa] }] }), /tamanho da pizza/)
  await assert.rejects(save({ name: 'Bebida na pizza', price: 10, is_active: false, groups: [{ name: 'Pizza', is_pizza_slot: true, fixed_pizza_size_id: SIZE, product_ids: [P.refri] }] }), /produto inválido/)
  const n = (await db.query(`SELECT count(*)::int c FROM combos WHERE name IN ('Vazio','Sem sabor','Sem tamanho','Bebida na pizza')`)).rows[0].c
  assert.equal(n, 0)
  // Rascunho (indisponível) pode ficar incompleto.
  const id = await save({ name: 'Rascunho', price: 0, is_active: false, groups: [{ name: 'Pizza', is_pizza_slot: true, fixed_pizza_size_id: SIZE, product_ids: [] }] })
  assert.ok(id)
})

await test('outra loja não edita o combo', async () => {
  const OTHER = '00000000-0000-0000-0000-0000000000c3'
  await db.exec(`INSERT INTO auth.users VALUES ('${OTHER}', 'outro@x.com'); INSERT INTO establishments (id, owner_id, name, slug, whatsapp_number) VALUES ('10000000-0000-0000-0000-0000000000c3', '${OTHER}', 'Outra', 'outra', '11911112222')`)
  await assert.rejects(as(db, 'authenticated', OTHER, `SELECT save_combo($1::jsonb)`, [JSON.stringify({ id: COMBO, name: 'Roubado', price: 1, is_active: false, groups: [] })]), /não encontrado/)
  await assert.rejects(as(db, 'anon', null, `SELECT save_combo($1::jsonb)`, [JSON.stringify({ name: 'x', price: 1 })]), /permission denied/)
})

console.log(results.join('\n'))
console.log(`\n${passed}/${results.length} testes da pizza no combo passaram`)
process.exit(passed === results.length ? 0 : 1)
