// Pratos em 3D (migration 061): colunas do modelo e vitrine pública.
import { createDb, as } from './harness.mjs'
import assert from 'node:assert/strict'

const OWNER = '00000000-0000-0000-0000-0000000000a1'
const EST = '10000000-0000-0000-0000-000000000001'
const P = '30000000-0000-0000-0000-000000000001'
const results = []
let passed = 0
async function test(name, fn) {
  try { await fn(); passed++; results.push(`  ok  ${name}`) } catch (e) { results.push(`FALHA ${name}\n      ${e.message}`) }
}

const db = await createDb()
await db.exec(`
  INSERT INTO auth.users VALUES ('${OWNER}', 'dono@x.com');
  INSERT INTO establishments (id, owner_id, name, slug, whatsapp_number) VALUES ('${EST}', '${OWNER}', 'Loja', 'loja', '11999999999');
  INSERT INTO products (id, establishment_id, name, price, track_stock) VALUES ('${P}', '${EST}', 'Hambúrguer', 25, false);
`)
const owner = (sql, params) => as(db, 'authenticated', OWNER, sql, params)

await test('dono grava o modelo e o cardápio público enxerga', async () => {
  await owner(`UPDATE products SET model_3d_url = 'https://x.supabase.co/storage/v1/object/public/uploads/a/models/b.glb', model_3d_ios_url = 'https://x.supabase.co/c.usdz' WHERE id = $1`, [P])
  const r = (await as(db, 'anon', null, `SELECT model_3d_url, model_3d_ios_url, price FROM public_products WHERE id = $1`, [P])).rows[0]
  assert.match(r.model_3d_url, /b\.glb$/)
  assert.match(r.model_3d_ios_url, /c\.usdz$/)
  assert.equal(Number(r.price), 25)
})

await test('só aceita endereço https', async () => {
  let failed = false
  try { await owner(`UPDATE products SET model_3d_url = 'javascript:alert(1)' WHERE id = $1`, [P]) } catch { failed = true }
  assert.equal(failed, true)
})

console.log(results.join('\n'))
console.log(`\n${passed}/${results.length} testes de pratos em 3D passaram`)
if (passed !== results.length) process.exit(1)
