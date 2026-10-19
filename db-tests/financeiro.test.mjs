// Financeiro conferido (migration 054): limpeza dos lançamentos antigos,
// uma entrada por pedido, comanda e cancelamento.
import { createDb, as, MIGRATIONS_DIR } from './harness.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const OWNER = '00000000-0000-0000-0000-0000000000a1'
const OTHER = '00000000-0000-0000-0000-0000000000b2'
const EST = '10000000-0000-0000-0000-000000000001'
const EST2 = '10000000-0000-0000-0000-000000000002'
const TABLE = '40000000-0000-0000-0000-000000000001'
const TAB = '50000000-0000-0000-0000-000000000001'
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

const db = await createDb({ upTo: 53 })
await db.exec(`
  INSERT INTO auth.users VALUES ('${OWNER}', 'dono@x.com'), ('${OTHER}', 'outro@x.com');
  INSERT INTO platform_settings (id, billing_enabled, monthly_price) VALUES (true, false, 49.9) ON CONFLICT (id) DO NOTHING;
  INSERT INTO establishments (id, owner_id, name, slug, whatsapp_number) VALUES
    ('${EST}', '${OWNER}', 'Loja', 'loja', '11999999999'),
    ('${EST2}', '${OTHER}', 'Outra', 'outra', '11999999998');
  INSERT INTO restaurant_tables (id, establishment_id, label) VALUES ('${TABLE}', '${EST}', 'Mesa 01');
  INSERT INTO table_tabs (id, establishment_id, table_id, status) VALUES ('${TAB}', '${EST}', '${TABLE}', 'open');
`)

let n = 0
async function order(extra = {}) {
  const o = { status: 'completed', source: 'online', order_type: 'pickup', total: 40, subtotal: 40, ...extra }
  const id = `60000000-0000-0000-0000-${String(++n).padStart(12, '0')}`
  await db.query(
    `INSERT INTO orders (id, establishment_id, customer_name, customer_phone, items, subtotal, shipping_fee, discount, total, status, source, order_type, table_tab_id, accepted_at)
     VALUES ($1, $2, 'Cliente', $10, '[]'::jsonb, $3, 0, 0, $4, $5, $6, $7, $8, $9)`,
    [id, extra.est || EST, o.subtotal, o.total, o.status, o.source, o.order_type, o.tab || null, o.accepted_at || null, '119' + String(70000000 + n)]
  )
  return id
}
const entries = async (id, type = 'income') => (await db.query(`SELECT * FROM financial_entries WHERE order_id = $1 AND type = $2`, [id, type])).rows
const owner = (sql, params) => as(db, 'authenticated', OWNER, sql, params)

// Situação herdada do código antigo do painel.
const dup = await order({ total: 49, subtotal: 49 })
await db.query(`INSERT INTO financial_entries (establishment_id, order_id, type, amount, description, created_at) VALUES
  ($1, $2, 'income', 49, 'Pedido dup', now() - interval '10 seconds'), ($1, $2, 'income', 49, 'Pedido dup', now())`, [EST, dup])
const missing = await order({ source: 'balcao', total: 35, subtotal: 35, accepted_at: '2026-07-24T10:32:00Z' })
const pendingNoEntry = await order({ status: 'pending' })
const cancelledNoEntry = await order({ status: 'cancelled' })

const file = fs.readdirSync(MIGRATIONS_DIR).find((f) => f.startsWith('054_'))
assert.ok(file, 'migration 054 não encontrada em ' + MIGRATIONS_DIR)
await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'))

await test('duplicada antiga vira uma entrada só', async () => {
  assert.equal((await entries(dup)).length, 1)
})

await test('venda antiga sem entrada é lançada na data da venda', async () => {
  const [e] = await entries(missing)
  assert.equal(Number(e.amount), 35)
  assert.equal(new Date(e.created_at).toISOString().slice(0, 10), '2026-07-24')
})

await test('pendente e cancelado continuam sem lançamento', async () => {
  assert.equal((await entries(pendingNoEntry)).length, 0)
  assert.equal((await entries(cancelledNoEntry)).length, 0)
})

await test('o banco recusa uma segunda entrada de venda para o mesmo pedido', async () => {
  await assert.rejects(db.query(`INSERT INTO financial_entries (establishment_id, order_id, type, amount) VALUES ($1, $2, 'income', 49)`, [EST, dup]))
})

await test('lojista lança à mão só o que não é de pedido', async () => {
  await owner(`INSERT INTO financial_entries (establishment_id, type, amount, description) VALUES ($1, 'expense', 120, 'Gás')`, [EST])
  const other = await order({ status: 'pending' })
  await assert.rejects(owner(`INSERT INTO financial_entries (establishment_id, order_id, type, amount) VALUES ($1, $2, 'income', 40)`, [EST, other]))
})

let mesa1, mesa2
await test('fechar comanda lança cada pedido da mesa (com o dono)', async () => {
  mesa1 = await order({ source: 'mesa', order_type: 'mesa', tab: TAB, total: 30, subtotal: 30 })
  mesa2 = await order({ source: 'mesa', order_type: 'mesa', tab: TAB, total: 20, subtotal: 20 })
  await assert.rejects(as(db, 'authenticated', OTHER, `SELECT close_table_tab($1)`, [TAB]), /não encontrada/)
  const total = (await owner(`SELECT close_table_tab($1) t`, [TAB])).rows[0].t
  assert.equal(Number(total), 50)
  assert.equal((await entries(mesa1)).length, 1)
  assert.equal((await entries(mesa2)).length, 1)
})

await test('cancelar pedido de comanda fechada tira o lançamento e acerta o total da comanda', async () => {
  await owner(`SELECT cancel_order($1, 'erro de lançamento')`, [mesa2])
  assert.equal((await entries(mesa2)).length, 0)
  const tab = (await db.query(`SELECT closed_total FROM table_tabs WHERE id = $1`, [TAB])).rows[0]
  assert.equal(Number(tab.closed_total), 30)
})

await test('cancelar remove também a tarifa do Pix automático', async () => {
  const pix = await order({ status: 'confirmed', total: 60, subtotal: 60 })
  await db.query(`INSERT INTO financial_entries (establishment_id, order_id, type, amount, description) VALUES
    ($1, $2, 'income', 60, 'Pedido'), ($1, $2, 'expense', 1, 'Comissão da plataforma (Pix automático)'), ($1, $2, 'expense', 0.59, 'Tarifa do Mercado Pago (Pix automático)')`, [EST, pix])
  await assert.rejects(db.query(`INSERT INTO financial_entries (establishment_id, order_id, type, amount, description) VALUES ($1, $2, 'expense', 0.59, 'Tarifa do Mercado Pago (Pix automático)')`, [EST, pix]))
  await owner(`SELECT cancel_order($1, 'cliente desistiu')`, [pix])
  assert.equal((await db.query(`SELECT count(*)::int c FROM financial_entries WHERE order_id = $1`, [pix])).rows[0].c, 0)
})

await test('aceite e balcão continuam lançando uma vez', async () => {
  const p = await order({ status: 'pending', total: 25, subtotal: 25 })
  await owner(`SELECT accept_order($1, 'confirmed')`, [p])
  assert.equal((await entries(p)).length, 1)
  await assert.rejects(owner(`SELECT accept_order($1, 'confirmed')`, [p]))
  assert.equal((await entries(p)).length, 1)
})

console.log(results.join('\n'))
console.log(`\n${passed}/${results.length} testes do financeiro passaram`)
if (passed !== results.length) process.exit(1)
