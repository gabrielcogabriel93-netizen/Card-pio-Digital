// Aviso "a loja abriu" (migration 051).
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

const db = await createDb()
await db.exec(`
  INSERT INTO auth.users VALUES ('${OWNER}', 'dono@x.com');
  INSERT INTO establishments (id, owner_id, name, slug, whatsapp_number, is_open) VALUES ('${EST}', '${OWNER}', 'Loja', 'loja', '11999999999', false);
`)
const owner = (sql, params) => as(db, 'authenticated', OWNER, sql, params)
const row = async () => (await db.query(`SELECT * FROM establishments WHERE id = $1`, [EST])).rows[0]
// Mesmo UPDATE condicional que lib/openPush.ts faz para reservar o envio do dia.
const claim = async (dayStart) => (await db.query(
  `UPDATE establishments SET open_push_last_sent_at = now() WHERE id = $1 AND open_push_enabled
     AND (open_push_last_sent_at IS NULL OR open_push_last_sent_at < $2) RETURNING id`, [EST, dayStart])).rows.length

await test('começa desligado, no modo automático', async () => {
  const r = await row()
  assert.equal(r.open_push_enabled, false)
  assert.equal(r.open_push_mode, 'auto')
})

await test('ligar "Aberta" grava a hora da abertura; desligar não mexe', async () => {
  assert.equal((await row()).opened_at, null)
  await owner(`UPDATE establishments SET is_open = true WHERE id = $1`, [EST])
  const opened = (await row()).opened_at
  assert.ok(opened)
  await owner(`UPDATE establishments SET is_open = false WHERE id = $1`, [EST])
  assert.equal(String((await row()).opened_at), String(opened))
})

await test('o lojista configura o próprio aviso; modo inválido é recusado', async () => {
  await owner(`UPDATE establishments SET open_push_enabled = true, open_push_mode = 'custom', open_push_title = 'Abrimos', open_push_body = 'Venha' WHERE id = $1`, [EST])
  await assert.rejects(owner(`UPDATE establishments SET open_push_mode = 'spam' WHERE id = $1`, [EST]), /check/)
})

await test('envio reservado só uma vez por dia', async () => {
  const today = new Date(Date.now() - 3600e3).toISOString()
  assert.equal(await claim(today), 1)
  assert.equal(await claim(today), 0)
  const tomorrow = new Date(Date.now() + 3600e3).toISOString()
  assert.equal(await claim(tomorrow), 1)
})

await test('desligado não reserva envio', async () => {
  await db.exec(`UPDATE establishments SET open_push_enabled = false, open_push_last_sent_at = NULL WHERE id = '${EST}'`)
  assert.equal(await claim(new Date().toISOString()), 0)
})

await test('configuração do aviso não aparece no cardápio público', async () => {
  const cols = (await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'public_establishments'`)).rows.map((r) => r.column_name)
  assert.ok(!cols.some((c) => c.startsWith('open_push') || c === 'opened_at'))
})

console.log(results.join('\n'))
console.log(`\n${passed}/${results.length} testes do aviso de abertura passaram`)
process.exit(passed === results.length ? 0 : 1)
