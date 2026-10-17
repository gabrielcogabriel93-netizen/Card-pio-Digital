// Testes das migrations 044/045 num Postgres em memória.
import { createDb, as } from './harness.mjs'
import assert from 'node:assert/strict'

const OWNER = '00000000-0000-0000-0000-0000000000a1'
const OTHER = '00000000-0000-0000-0000-0000000000b2'
const EST = '10000000-0000-0000-0000-000000000001'
let passed = 0
const results = []

async function test(name, fn) {
  try {
    // Limites anti-abuso (por IP e por telefone) zerados entre testes.
    await db.exec(`DELETE FROM rate_limit_hits; UPDATE orders SET created_at = created_at - interval '10 minutes';`)
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
    return e.message
  }
  throw new Error('deveria ter falhado')
}

const db = await createDb()

await db.exec(`
  INSERT INTO auth.users VALUES ('${OWNER}', 'dono@x.com'), ('${OTHER}', 'outro@x.com');
  INSERT INTO platform_settings (id, billing_enabled, monthly_price) VALUES (true, false, 49.9) ON CONFLICT (id) DO NOTHING;
  INSERT INTO establishments (id, owner_id, name, slug, whatsapp_number, delivery_fee, free_shipping_threshold, birthday_discount_percent, plan_tier, opening_hours)
  VALUES ('${EST}', '${OWNER}', 'Bella', 'bella', '11999999999', 5, 100, 10, 'completo', NULL);
  INSERT INTO categories (id, establishment_id, name) VALUES ('20000000-0000-0000-0000-000000000001', '${EST}', 'Lanches');
  INSERT INTO products (id, establishment_id, name, price, track_stock, stock_qty) VALUES
    ('30000000-0000-0000-0000-000000000001', '${EST}', 'X-Burger', 20, true, 10),
    ('30000000-0000-0000-0000-000000000002', '${EST}', 'Refri', 6, false, 0),
    ('30000000-0000-0000-0000-000000000003', '${EST}', 'Suco', 8, true, 1);
  INSERT INTO variation_groups (id, product_id, name, is_required, allow_multiple, max_select) VALUES
    ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Ponto', true, false, NULL),
    ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'Extras', false, true, 2);
  INSERT INTO variation_options (id, variation_group_id, name, price_delta) VALUES
    ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Mal passado', 0),
    ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 'Bacon', 4),
    ('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000002', 'Ovo', 2),
    ('50000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000002', 'Queijo', 3);
  INSERT INTO pizza_sizes (id, establishment_id, name, base_price, max_flavors) VALUES ('60000000-0000-0000-0000-000000000001', '${EST}', 'Grande', 40, 2);
  INSERT INTO pizza_flavors (id, establishment_id, name, category) VALUES
    ('61000000-0000-0000-0000-000000000001', '${EST}', 'Calabresa', 'salgada'),
    ('61000000-0000-0000-0000-000000000002', '${EST}', 'Camarão', 'salgada'),
    ('61000000-0000-0000-0000-000000000003', '${EST}', 'Chocolate', 'doce');
  INSERT INTO pizza_flavor_prices (flavor_id, size_id, price_delta) VALUES
    ('61000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', 15);
  INSERT INTO pizza_additionals (id, establishment_id, name) VALUES ('62000000-0000-0000-0000-000000000001', '${EST}', 'Borda');
  INSERT INTO pizza_additional_prices (additional_id, size_id, price) VALUES ('62000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 7);
  INSERT INTO products (id, establishment_id, name, price, track_stock, pizza_flavor_id) VALUES
    ('30000000-0000-0000-0000-000000000009', '${EST}', 'Pizza Calabresa', 40, false, '61000000-0000-0000-0000-000000000001');
  INSERT INTO combos (id, establishment_id, name, price) VALUES ('70000000-0000-0000-0000-000000000001', '${EST}', 'Combo Lanche', 24);
  INSERT INTO combo_groups (id, combo_id, name) VALUES ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'Bebida');
  INSERT INTO combo_group_products (combo_group_id, product_id) VALUES
    ('71000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002'),
    ('71000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003');
  INSERT INTO coupons (establishment_id, code, discount_type, discount_value, is_active) VALUES ('${EST}', 'DEZ', 'percent', 10, true);
`)

const anon = (sql, params) => as(db, 'anon', null, sql, params)
const owner = (sql, params) => as(db, 'authenticated', OWNER, sql, params)
const other = (sql, params) => as(db, 'authenticated', OTHER, sql, params)
const place = async (payload) => (await anon('SELECT place_order($1::jsonb) AS r', [JSON.stringify({ establishment_id: EST, customer_name: 'Ana', customer_phone: '(11) 98888-7777', order_type: 'pickup', ...payload })])).rows[0].r
const burger = (extra = {}) => ({ kind: 'product', product_id: '30000000-0000-0000-0000-000000000001', quantity: 1, option_ids: ['50000000-0000-0000-0000-000000000001'], ...extra })
const orderRow = async (id) => (await db.query('SELECT * FROM orders WHERE id = $1', [id])).rows[0]

await test('C1: anon não insere mais pedido direto na tabela', async () => {
  await rejects(anon(`INSERT INTO orders (establishment_id, customer_name, customer_phone, items, subtotal, total, status, payment_status)
    VALUES ('${EST}', 'X', '11988887777', '[]', 1, 1, 'completed', 'approved')`), /row-level security|permission/i)
})

await test('C1: outro lojista não insere pedido em loja alheia', async () => {
  await rejects(other(`INSERT INTO orders (establishment_id, customer_name, customer_phone, items, subtotal, total)
    VALUES ('${EST}', 'X', '1', '[]', 1, 1)`), /row-level security/i)
})

let tokenAna
await test('place_order recalcula preço (ignora preço enviado) e emite token no 1º pedido', async () => {
  const r = await place({ items: [burger({ option_ids: ['50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002'], unit_price: 0.01, quantity: 2 })] })
  assert.equal(Number(r.subtotal), 48) // (20 + 4) * 2
  assert.equal(Number(r.total), 48)
  assert.ok(r.customer_token && r.customer_token.length >= 32)
  tokenAna = r.customer_token
  const o = await orderRow(r.order_id)
  assert.equal(o.status, 'pending')
  assert.equal(o.payment_status, null)
  assert.equal(o.priced_by_server, true)
  assert.equal(o.items[0].variations.length, 2)
})

await test('place_order exige opção obrigatória e respeita "escolha até 2"', async () => {
  await rejects(place({ items: [burger({ option_ids: [] })] }), /Ponto/)
  await rejects(place({ items: [burger({ option_ids: ['50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000004'] })] }), /até 2/)
})

await test('place_order rejeita opção de outro produto', async () => {
  await rejects(place({ items: [{ kind: 'product', product_id: '30000000-0000-0000-0000-000000000002', quantity: 1, option_ids: ['50000000-0000-0000-0000-000000000002'] }] }), /não existe mais/)
})

await test('pizza meio a meio cobra o sabor mais caro + adicional', async () => {
  const r = await place({ customer_phone: '11977776666', items: [{ kind: 'pizza', product_id: '30000000-0000-0000-0000-000000000009', quantity: 1, size_id: '60000000-0000-0000-0000-000000000001', flavor_ids: ['61000000-0000-0000-0000-000000000002'], additional_ids: ['62000000-0000-0000-0000-000000000001'] }] })
  assert.equal(Number(r.total), 62) // 40 + 15 (camarão) + 7 (borda)
})

await test('pizza: não mistura salgada com doce', async () => {
  await rejects(place({ customer_phone: '11977776666', items: [{ kind: 'pizza', product_id: '30000000-0000-0000-0000-000000000009', quantity: 1, size_id: '60000000-0000-0000-0000-000000000001', flavor_ids: ['61000000-0000-0000-0000-000000000003'] }] }), /Combinação/)
})

await test('C8: combo tem preço do combo e passa a valer para Pix', async () => {
  const r = await place({ customer_phone: '11966665555', items: [{ kind: 'combo', combo_id: '70000000-0000-0000-0000-000000000001', quantity: 1, selections: [{ group_id: '71000000-0000-0000-0000-000000000001', product_id: '30000000-0000-0000-0000-000000000002' }] }] })
  assert.equal(Number(r.total), 24)
  const o = await orderRow(r.order_id)
  assert.equal(o.items[0].combo_selections[0].product_name, 'Refri')
})

await test('estoque: não vende mais do que tem', async () => {
  await rejects(place({ customer_phone: '11955554444', items: [{ kind: 'product', product_id: '30000000-0000-0000-0000-000000000003', quantity: 2 }] }), /esgotado|estoque/i)
})

await test('entrega: frete padrão e frete grátis acima de R$ 100', async () => {
  const addr = { street: 'Rua A', number: '1', neighborhood: 'Centro' }
  const r1 = await place({ customer_phone: '11944443333', order_type: 'delivery', delivery_address: addr, items: [burger()] })
  assert.equal(Number(r1.shipping_fee), 5)
  assert.equal(Number(r1.total), 25)
  const r2 = await place({ customer_phone: '11944443333', order_type: 'delivery', delivery_address: addr, items: [burger({ quantity: 5 })] })
  assert.equal(Number(r2.shipping_fee), 0)
})

await test('cupom aplicado no servidor', async () => {
  const r = await place({ customer_phone: '11933332222', coupon_code: 'dez', items: [burger()] })
  assert.equal(Number(r.discount), 2)
  assert.equal(Number(r.total), 18)
})

await test('A1: aniversário digitado na hora não dá desconto', async () => {
  const today = (await db.query(`SELECT to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') d`)).rows[0].d
  const r = await place({ customer_phone: '11922221111', birth_date: '1990' + today.slice(4), use_birthday: true, items: [burger()] })
  assert.equal(Number(r.discount), 0)
})

await test('aniversário informado há mais de 30 dias dá desconto uma vez', async () => {
  await db.exec(`UPDATE customers SET birth_date_set_at = now() - interval '40 days' WHERE phone = '11922221111'`)
  const r = await place({ customer_phone: '11922221111', use_birthday: true, items: [burger()] })
  assert.equal(Number(r.discount), 2)
  const r2 = await place({ customer_phone: '11922221111', use_birthday: true, items: [burger()] })
  assert.equal(Number(r2.discount), 0)
})

await test('C7: perfil sem token não expõe nome, endereço nem pontos', async () => {
  const res = await anon(`SELECT * FROM get_customer_profile($1, $2, NULL)`, [EST, '11988887777'])
  const row = res.rows[0]
  assert.equal(row.has_profile, true)
  assert.equal(row.verified, false)
  assert.equal(row.name, null)
  assert.equal(row.loyalty_points_balance, null)
})

await test('perfil com token devolve os dados', async () => {
  const row = (await anon(`SELECT * FROM get_customer_profile($1, $2, $3)`, [EST, '11988887777', tokenAna])).rows[0]
  assert.equal(row.verified, true)
  assert.equal(row.name, 'Ana')
})

await test('C7: apagar dados ou ver pedidos sem token é recusado', async () => {
  await rejects(anon(`SELECT delete_customer_data($1, $2, NULL)`, [EST, '11988887777']), /Confirme/)
  await rejects(anon(`SELECT * FROM get_orders_by_phone($1, $2, 'x')`, [EST, '11988887777']), /Confirme/)
  const ok = await anon(`SELECT * FROM get_orders_by_phone($1, $2, $3)`, [EST, '11988887777', tokenAna])
  assert.ok(ok.rows.length >= 1)
})

await test('pedido com telefone de cliente que já tem token não ganha token novo', async () => {
  const r = await place({ items: [burger()] }) // mesmo telefone da Ana, sem token
  assert.equal(r.customer_token, null)
})

await test('fidelidade: pontos ganhos só ao concluir; resgate exige token', async () => {
  await db.exec(`INSERT INTO loyalty_settings (establishment_id, is_active, points_per_currency) VALUES ('${EST}', true, 1);
    INSERT INTO loyalty_rewards (id, establishment_id, name, points_cost, benefit_type, benefit_value, is_active)
    VALUES ('80000000-0000-0000-0000-000000000001', '${EST}', '5 reais', 10, 'fixed_discount', 5, true);`)
  const r = await place({ customer_token: tokenAna, items: [burger({ quantity: 2 })] })
  await owner(`SELECT accept_order($1, 'confirmed', NULL, 'dinheiro', 30)`, [r.order_id])
  await owner(`SELECT advance_order($1, 'completed', false)`, [r.order_id])
  const bal = (await db.query(`SELECT loyalty_points_balance b FROM customers WHERE phone = '11988887777'`)).rows[0].b
  assert.equal(bal, 40)
  await rejects(place({ reward_id: '80000000-0000-0000-0000-000000000001', items: [burger()] }), /Confirme seu telefone/)
  const r2 = await place({ customer_token: tokenAna, reward_id: '80000000-0000-0000-0000-000000000001', items: [burger()] })
  assert.equal(Number(r2.discount), 5)
})

await test('OTP: código certo gera token, errado conta tentativa', async () => {
  const code = (await as(db, 'service_role', null, `SELECT create_customer_otp($1, $2) c`, [EST, '11988887777'])).rows[0].c
  await rejects(anon(`SELECT verify_customer_otp($1, $2, '000000x')`, [EST, '11988887777']), /incorreto/)
  const t = (await anon(`SELECT verify_customer_otp($1, $2, $3) t`, [EST, '11988887777', code])).rows[0].t
  assert.ok(t.length >= 32)
  await rejects(anon(`SELECT create_customer_otp($1, $2)`, [EST, '11988887777']), /permission/i)
})

await test('aceite: financeiro e estoque juntos; C6 sem comissão em dinheiro', async () => {
  const r = await place({ customer_phone: '11911110000', items: [burger({ quantity: 3 })] })
  const before = (await db.query(`SELECT stock_qty FROM products WHERE id = '30000000-0000-0000-0000-000000000001'`)).rows[0].stock_qty
  await owner(`SELECT accept_order($1, 'confirmed', NULL, 'dinheiro', 25)`, [r.order_id])
  const after = (await db.query(`SELECT stock_qty FROM products WHERE id = '30000000-0000-0000-0000-000000000001'`)).rows[0].stock_qty
  assert.equal(before - after, 3)
  const fin = (await db.query(`SELECT type, amount FROM financial_entries WHERE order_id = $1`, [r.order_id])).rows
  assert.deepEqual(fin.map((f) => f.type), ['income'])
  const o = await orderRow(r.order_id)
  assert.equal(o.eta_minutes, 25)
  assert.ok(o.accepted_at)
})

await test('aceite duplicado é recusado', async () => {
  const r = await place({ customer_phone: '11911110001', items: [burger()] })
  await owner(`SELECT accept_order($1)`, [r.order_id])
  await rejects(owner(`SELECT accept_order($1)`, [r.order_id]), /já foi atualizado/)
})

await test('outro lojista não aceita pedido alheio', async () => {
  const r = await place({ customer_phone: '11911110002', items: [burger()] })
  await rejects(other(`SELECT accept_order($1)`, [r.order_id]), /não encontrado/)
})

await test('saiu para entrega + cancelamento estorna estoque e financeiro', async () => {
  const r = await place({ customer_phone: '11911110003', items: [burger({ quantity: 2 })] })
  await owner(`SELECT accept_order($1)`, [r.order_id])
  await owner(`SELECT advance_order($1, NULL, true)`, [r.order_id])
  assert.ok((await orderRow(r.order_id)).dispatched_at)
  const before = (await db.query(`SELECT stock_qty FROM products WHERE id = '30000000-0000-0000-0000-000000000001'`)).rows[0].stock_qty
  await rejects(owner(`SELECT cancel_order($1, '')`, [r.order_id]), /motivo/)
  await owner(`SELECT cancel_order($1, 'Cliente desistiu')`, [r.order_id])
  const after = (await db.query(`SELECT stock_qty FROM products WHERE id = '30000000-0000-0000-0000-000000000001'`)).rows[0].stock_qty
  assert.equal(after - before, 2)
  assert.equal((await db.query(`SELECT count(*)::int c FROM financial_entries WHERE order_id = $1`, [r.order_id])).rows[0].c, 0)
  assert.ok((await orderRow(r.order_id)).cancelled_at)
})

await test('Pix automático: aceite manual bloqueado até pagar; comissão só quando pago', async () => {
  await db.exec(`INSERT INTO mercadopago_accounts (establishment_id, mp_user_id, access_token, refresh_token, expires_at, is_active)
    VALUES ('${EST}', '1', 'a', 'b', now() + interval '1 day', true)`)
  const r = await place({ customer_phone: '11911110004', payment_method: 'mercadopago_pix', items: [burger()] })
  assert.equal((await orderRow(r.order_id)).payment_status, 'pending')
  await rejects(owner(`SELECT accept_order($1)`, [r.order_id]), /ainda não foi pago/)
  const none = (await as(db, 'service_role', null, `SELECT service_accept_order($1, 'confirmed') o`, [r.order_id])).rows[0].o
  assert.equal(none, null)
  await db.query(`UPDATE orders SET payment_status = 'approved' WHERE id = $1`, [r.order_id])
  await as(db, 'service_role', null, `SELECT service_accept_order($1, 'confirmed')`, [r.order_id])
  const types = (await db.query(`SELECT type FROM financial_entries WHERE order_id = $1 ORDER BY type`, [r.order_id])).rows.map((x) => x.type)
  assert.deepEqual(types, ['expense', 'income'])
})

await test('A8: lojista não apaga lançamento de pedido, só manual', async () => {
  const fe = (await db.query(`SELECT id FROM financial_entries WHERE order_id IS NOT NULL LIMIT 1`)).rows[0]
  await owner(`DELETE FROM financial_entries WHERE id = $1`, [fe.id])
  assert.equal((await db.query(`SELECT count(*)::int c FROM financial_entries WHERE id = $1`, [fe.id])).rows[0].c, 1)
  await db.exec(`INSERT INTO financial_entries (id, establishment_id, type, amount, description) VALUES ('90000000-0000-0000-0000-000000000001', '${EST}', 'expense', 10, 'gás')`)
  await owner(`DELETE FROM financial_entries WHERE id = '90000000-0000-0000-0000-000000000001'`)
  assert.equal((await db.query(`SELECT count(*)::int c FROM financial_entries WHERE id = '90000000-0000-0000-0000-000000000001'`)).rows[0].c, 0)
})

await test('balcão: venda atômica, consumidor final, sem cliente vazio', async () => {
  const id = (await owner(`SELECT balcao_sale($1::jsonb) id`, [JSON.stringify({ establishment_id: EST, payment_method: 'dinheiro', items: [{ product_id: '30000000-0000-0000-0000-000000000002', product_name: 'Refri', quantity: 2, unit_price: 6, total_price: 12, variations: [] }] })])).rows[0].id
  const o = await orderRow(id)
  assert.equal(o.customer_name, 'Consumidor final')
  assert.equal(Number(o.total), 12)
  assert.equal((await db.query(`SELECT count(*)::int c FROM customers WHERE phone = ''`)).rows[0].c, 0)
  await rejects(owner(`SELECT balcao_sale($1::jsonb)`, [JSON.stringify({ establishment_id: EST, items: [{ product_id: '30000000-0000-0000-0000-000000000003', product_name: 'Suco', quantity: 5, unit_price: 8, total_price: 40 }] })]), /Estoque insuficiente/)
})

await test('A7: loja fechada, pausada ou bloqueada não recebe pedido', async () => {
  await db.exec(`UPDATE establishments SET is_open = false WHERE id = '${EST}'`)
  await rejects(place({ customer_phone: '11900000001', items: [burger()] }), /fechada/)
  await db.exec(`UPDATE establishments SET is_open = true, paused_until = now() + interval '20 minutes' WHERE id = '${EST}'`)
  await rejects(place({ customer_phone: '11900000001', items: [burger()] }), /fechada/)
  await db.exec(`SELECT set_config('request.jwt.claim.role', 'service_role', false);
    UPDATE establishments SET paused_until = NULL WHERE id = '${EST}';
    UPDATE platform_settings SET billing_enabled = true;
    UPDATE establishments SET trial_ends_at = now() - interval '1 day' WHERE id = '${EST}';`)
  await rejects(place({ customer_phone: '11900000001', items: [burger()] }), /não está recebendo/)
  await db.exec(`UPDATE platform_settings SET billing_enabled = false`)
})

await test('pedido mínimo', async () => {
  await db.exec(`UPDATE establishments SET min_order_value = 50 WHERE id = '${EST}'`)
  await rejects(place({ customer_phone: '11900000002', items: [burger()] }), /mínimo/)
  await db.exec(`UPDATE establishments SET min_order_value = NULL WHERE id = '${EST}'`)
})

await test('troco menor que o total é recusado', async () => {
  await rejects(place({ customer_phone: '11900000003', payment_method: 'dinheiro', change_for: 10, items: [burger()] }), /troco/i)
})

await test('esgotado "até amanhã" some do estoque público e bloqueia pedido', async () => {
  await db.exec(`UPDATE products SET sold_out_until = now() + interval '1 day' WHERE id = '30000000-0000-0000-0000-000000000002'`)
  const v = (await anon(`SELECT in_stock FROM public_products WHERE id = '30000000-0000-0000-0000-000000000002'`)).rows[0]
  assert.equal(v.in_stock, false)
  await rejects(place({ customer_phone: '11900000004', items: [{ kind: 'product', product_id: '30000000-0000-0000-0000-000000000002', quantity: 1 }] }), /esgotado/)
  await db.exec(`UPDATE products SET sold_out_until = NULL WHERE id = '30000000-0000-0000-0000-000000000002'`)
})

await test('avaliação só em pedido concluído, uma vez', async () => {
  const id = (await db.query(`SELECT id FROM orders WHERE status = 'completed' AND source = 'online' LIMIT 1`)).rows[0].id
  assert.equal((await anon(`SELECT submit_order_review($1, 5, 'top') r`, [id])).rows[0].r, true)
  assert.equal((await anon(`SELECT submit_order_review($1, 1, 'de novo') r`, [id])).rows[0].r, false)
})

await test('funções internas fechadas para anon', async () => {
  await rejects(anon(`SELECT price_order_items($1, '[]'::jsonb)`, [EST]), /permission/i)
  await rejects(anon(`SELECT issue_customer_token($1, '11999999999')`, [EST]), /permission/i)
  await rejects(anon(`SELECT * FROM validate_loyalty_redemption($1, $1, '1')`, [EST]), /permission/i)
})

await test('limite por IP: 16º pedido em 5 minutos é recusado', async () => {
  for (let i = 0; i < 15; i++) {
    await place({ customer_phone: `1191234${String(i).padStart(4, '0')}`, items: [{ kind: 'product', product_id: '30000000-0000-0000-0000-000000000002', quantity: 1 }] })
  }
  await rejects(place({ customer_phone: '11912349999', items: [{ kind: 'product', product_id: '30000000-0000-0000-0000-000000000002', quantity: 1 }] }), /Muitos pedidos/)
})

await test('quote_order_items devolve o mesmo preço do servidor', async () => {
  const q = (await anon(`SELECT quote_order_items($1, $2::jsonb) q`, [EST, JSON.stringify([burger({ option_ids: ['50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003'] })])])).rows[0].q
  assert.equal(Number(q[0].unit_price), 22)
})

console.log(results.join('\n'))
console.log(`\n${passed}/${results.length} testes de banco passaram`)
process.exit(passed === results.length ? 0 : 1)
