// Cardápio do dia, oferta "de/por", banners e promoções (migration 060).
import { createDb, as } from './harness.mjs'
import assert from 'node:assert/strict'

const OWNER = '00000000-0000-0000-0000-0000000000a1'
const OTHER = '00000000-0000-0000-0000-0000000000b2'
const EST = '10000000-0000-0000-0000-000000000001'
const P = '30000000-0000-0000-0000-000000000001'
const G_SIZE = '40000000-0000-0000-0000-000000000001'
const G_ACOMP = '40000000-0000-0000-0000-000000000002'
const O = (n) => `50000000-0000-0000-0000-00000000000${n}`
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
await db.exec(`
  INSERT INTO auth.users VALUES ('${OWNER}', 'dono@x.com'), ('${OTHER}', 'outro@x.com');
  INSERT INTO platform_settings (id, billing_enabled, monthly_price) VALUES (true, false, 49.9) ON CONFLICT (id) DO NOTHING;
  INSERT INTO establishments (id, owner_id, name, slug, whatsapp_number, plan_tier, opening_hours) VALUES ('${EST}', '${OWNER}', 'Restaurante', 'rest', '11999999999', 'completo', NULL);
  INSERT INTO products (id, establishment_id, name, price, track_stock) VALUES ('${P}', '${EST}', 'Filé à milanesa', 15, false);
  INSERT INTO variation_groups (id, product_id, name, is_required, allow_multiple, display_order) VALUES ('${G_SIZE}', '${P}', 'Tamanho', true, false, 0);
  INSERT INTO variation_groups (id, product_id, name, is_required, allow_multiple, min_select, max_select, display_order) VALUES ('${G_ACOMP}', '${P}', 'Acompanhamentos', true, true, 2, 3, 1);
  INSERT INTO variation_options (id, variation_group_id, name, price_delta) VALUES
    ('${O(1)}', '${G_SIZE}', 'Pequena', 0), ('${O(2)}', '${G_SIZE}', 'Grande', 3),
    ('${O(3)}', '${G_ACOMP}', 'Arroz', 0), ('${O(4)}', '${G_ACOMP}', 'Feijão', 0), ('${O(5)}', '${G_ACOMP}', 'Farofa', 0);
`)
const quote = async (options) => (await as(db, 'anon', null, `SELECT quote_order_items($1, $2::jsonb) r`, [EST, JSON.stringify([{ kind: 'product', product_id: P, quantity: 1, option_ids: options }])])).rows[0].r[0]
const owner = (sql, params) => as(db, 'authenticated', OWNER, sql, params)

await test('marmita: tamanho + mínimo de acompanhamentos', async () => {
  const r = await quote([O(2), O(3), O(4)])
  assert.equal(Number(r.unit_price), 18)
  await rejects(quote([O(1), O(3)]), /pelo menos 2/)
  await rejects(quote([O(1), O(2), O(3), O(4)]), /Escolha só uma/)
})

await test('opção "acabou hoje" é recusada e volta ao passar o prazo', async () => {
  await db.exec(`UPDATE variation_options SET sold_out_until = now() + interval '2 hours' WHERE id = '${O(4)}'`)
  await rejects(quote([O(1), O(3), O(4)]), /"Feijão" acabou por hoje/)
  await db.exec(`UPDATE variation_options SET sold_out_until = now() - interval '1 minute' WHERE id = '${O(4)}'`)
  assert.equal(Number((await quote([O(1), O(3), O(4)])).unit_price), 15)
})

await test('oferta "de/por": servidor cobra o promocional e a vitrine mostra os dois', async () => {
  await db.exec(`UPDATE products SET promo_price = 12.9, promo_until = now() + interval '3 days' WHERE id = '${P}'`)
  assert.equal(Number((await quote([O(2), O(3), O(4)])).unit_price), 15.9)
  const v = (await as(db, 'anon', null, `SELECT price, original_price FROM public_products WHERE id = $1`, [P])).rows[0]
  assert.deepEqual([Number(v.price), Number(v.original_price)], [12.9, 15])
  await db.exec(`UPDATE products SET promo_until = now() - interval '1 minute' WHERE id = '${P}'`)
  const after = (await as(db, 'anon', null, `SELECT price, original_price FROM public_products WHERE id = $1`, [P])).rows[0]
  assert.deepEqual([Number(after.price), after.original_price], [15, null])
  assert.equal(Number((await quote([O(1), O(3), O(4)])).unit_price), 15)
})

await test('prato só em certos dias: fora do dia some da venda', async () => {
  const dow = Number((await db.query(`SELECT extract(dow FROM now() AT TIME ZONE 'America/Sao_Paulo')::int d`)).rows[0].d)
  await db.exec(`UPDATE products SET available_weekdays = ARRAY[${(dow + 1) % 7}]::smallint[] WHERE id = '${P}'`)
  assert.equal((await as(db, 'anon', null, `SELECT in_stock FROM public_products WHERE id = $1`, [P])).rows[0].in_stock, false)
  await rejects(quote([O(1), O(3), O(4)]), /não é servido hoje/)
  await db.exec(`UPDATE products SET available_weekdays = ARRAY[${dow}]::smallint[] WHERE id = '${P}'`)
  assert.equal((await as(db, 'anon', null, `SELECT in_stock FROM public_products WHERE id = $1`, [P])).rows[0].in_stock, true)
  await db.exec(`UPDATE products SET available_weekdays = NULL WHERE id = '${P}'`)
})

await test('banners: do lojista (no período), cupons divulgados e mais pedidos', async () => {
  await owner(`INSERT INTO store_banners (establishment_id, title, link_type, link_ref) VALUES ($1, 'Marmita do dia', 'produto', $2)`, [EST, P])
  await owner(`INSERT INTO store_banners (establishment_id, title, ends_at) VALUES ($1, 'Vencido', now() - interval '1 day')`, [EST])
  await owner(`INSERT INTO coupons (establishment_id, code, discount_type, discount_value, show_on_menu) VALUES ($1, 'BEMVINDO10', 'percent', 10, true), ($1, 'SEGREDO', 'percent', 50, false)`, [EST])
  for (let i = 0; i < 3; i++) {
    await db.query(`INSERT INTO orders (establishment_id, customer_name, customer_phone, items, subtotal, total, status) VALUES ($1, 'C', $2, $3::jsonb, 15, 15, 'completed')`,
      [EST, `119800000${i}0`, JSON.stringify([{ product_id: P, quantity: 1, total_price: 15 }])])
  }
  const r = (await as(db, 'anon', null, `SELECT get_store_banners($1) b`, [EST])).rows[0].b
  assert.deepEqual(r.banners.map((b) => b.title), ['Marmita do dia'])
  assert.deepEqual(r.coupons.map((c) => c.code), ['BEMVINDO10'])
  assert.deepEqual(r.top_products, [P])
  await db.exec(`UPDATE establishments SET banner_show_top = false, banner_show_coupons = false WHERE id = '${EST}'`)
  const off = (await as(db, 'anon', null, `SELECT get_store_banners($1) b`, [EST])).rows[0].b
  assert.deepEqual([off.top_products.length, off.coupons.length], [0, 0])
})

await test('banners e promoções: só o dono mexe', async () => {
  await rejects(as(db, 'authenticated', OTHER, `INSERT INTO store_banners (establishment_id, title) VALUES ($1, 'x')`, [EST]), /row-level security/)
  assert.equal((await as(db, 'anon', null, `SELECT count(*)::int c FROM store_banners`)).rows[0].c, 0)
  await owner(`INSERT INTO store_promotions (establishment_id, kind, title) VALUES ($1, 'preco', 'Prato da semana')`, [EST])
  assert.equal((await as(db, 'authenticated', OTHER, `SELECT count(*)::int c FROM store_promotions`)).rows[0].c, 0)
  assert.equal((await owner(`SELECT count(*)::int c FROM store_promotions`)).rows[0].c, 1)
})

console.log(results.join('\n'))
console.log(`\n${passed}/${results.length} testes do cardápio do dia passaram`)
if (passed !== results.length) process.exit(1)
