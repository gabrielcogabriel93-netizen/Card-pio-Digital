// Sobe um Postgres em memória (PGlite) com substitutos mínimos do Supabase
// (auth, storage, pg_net, pg_cron, papéis anon/authenticated/service_role)
// e aplica as migrations do projeto em ordem.
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import path from 'node:path'

import { fileURLToPath } from 'node:url'
export const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

const STUBS = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'service_role') $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT SELECT ON auth.users TO anon, authenticated, service_role;

CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array(name, '/') $$;

CREATE SCHEMA net;
CREATE TABLE net.calls (id bigserial, url text, body jsonb);
CREATE FUNCTION net.http_post(url text, headers jsonb DEFAULT '{}', body jsonb DEFAULT '{}') RETURNS bigint
  LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN INSERT INTO net.calls(url, body) VALUES (url, body); RETURN 1; END $$;
GRANT USAGE ON SCHEMA net TO anon, authenticated, service_role;

CREATE SCHEMA cron;
CREATE FUNCTION cron.schedule(a text, b text, c text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
`

export async function createDb({ upTo = Infinity, only } = {}) {
  const db = new PGlite()
  await db.exec(STUBS)
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort()
  for (const file of files) {
    const num = Number(file.slice(0, 3))
    if (num > upTo) break
    if (only && !only.includes(num)) continue
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8').replace(/CREATE EXTENSION[^;]*;/gi, '')
    try {
      await db.exec(sql)
    } catch (err) {
      throw new Error(`Falha em ${file}: ${err.message}`)
    }
  }
  return db
}

// Executa SQL como um papel do Supabase (anon / authenticated com sub / service_role).
export async function as(db, role, sub, sql, params = []) {
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '${sub || ''}', false); SELECT set_config('request.jwt.claim.role', '${role}', false);`)
  await db.exec(`SET ROLE ${role}`)
  try {
    return await db.query(sql, params)
  } finally {
    await db.exec('RESET ROLE')
  }
}
