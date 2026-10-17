import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logError } from '@/lib/logger'
import { normalizeDomainInput, isValidDomain, dnsRecordFor } from '@/lib/domains'

export const runtime = 'nodejs'

// Domínio próprio em um clique (plano Completo): adiciona o domínio no
// projeto da Vercel pela API e grava em establishments.custom_domain. O
// lojista só precisa criar o registro DNS que a tela mostra. Antes isso
// exigia cadastrar cada domínio à mão no painel da Vercel.
//
// Requer VERCEL_TOKEN e VERCEL_PROJECT_ID (VERCEL_TEAM_ID se o projeto
// for de um time). Sem essas variáveis o domínio é salvo e a tela mostra
// o passo a passo manual.

function vercelConfig() {
  const token = process.env.VERCEL_TOKEN
  const projectId = process.env.VERCEL_PROJECT_ID
  if (!token || !projectId) return null
  return { token, projectId, teamId: process.env.VERCEL_TEAM_ID || null }
}

async function vercel(path: string, init: RequestInit = {}) {
  const cfg = vercelConfig()!
  const url = new URL(`https://api.vercel.com${path}`)
  if (cfg.teamId) url.searchParams.set('teamId', cfg.teamId)
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

async function getOwnerEstablishment() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('establishments').select('id, custom_domain').eq('owner_id', user.id).maybeSingle()
  if (!data) return null
  const { data: hasCompleto } = await supabase.rpc('establishment_has_completo_access', { p_establishment_id: data.id })
  return { ...data, hasCompleto: !!hasCompleto }
}

// Situação do domínio atual: verificado? DNS configurado? O que criar.
export async function GET() {
  const est = await getOwnerEstablishment()
  if (!est) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!est.custom_domain) return NextResponse.json({ domain: null, automatic: !!vercelConfig() })

  const dns = dnsRecordFor(est.custom_domain)
  if (!vercelConfig()) return NextResponse.json({ domain: est.custom_domain, automatic: false, dns })

  const cfg = vercelConfig()!
  const [project, config] = await Promise.all([
    vercel(`/v9/projects/${cfg.projectId}/domains/${est.custom_domain}`),
    vercel(`/v6/domains/${est.custom_domain}/config`),
  ])
  return NextResponse.json({
    domain: est.custom_domain,
    automatic: true,
    verified: !!project.data?.verified,
    misconfigured: config.data?.misconfigured ?? true,
    dns,
  })
}

export async function POST(request: NextRequest) {
  const est = await getOwnerEstablishment()
  if (!est) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!est.hasCompleto) return NextResponse.json({ error: 'Domínio próprio faz parte do plano Completo.' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const domain = normalizeDomainInput(String(body?.domain || ''))
  if (!isValidDomain(domain)) return NextResponse.json({ error: 'Domínio inválido. Ex: cardapio.minhaloja.com.br' }, { status: 400 })

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN
  if (rootDomain && (domain === rootDomain || domain.endsWith(`.${rootDomain}`))) {
    return NextResponse.json({ error: 'Use um domínio seu, não o da plataforma.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: taken } = await admin.from('establishments').select('id').eq('custom_domain', domain).neq('id', est.id).maybeSingle()
  if (taken) return NextResponse.json({ error: 'Esse domínio já está em uso por outra loja.' }, { status: 409 })

  if (vercelConfig()) {
    const cfg = vercelConfig()!
    const added = await vercel(`/v10/projects/${cfg.projectId}/domains`, { method: 'POST', body: JSON.stringify({ name: domain }) })
    if (!added.ok && added.data?.error?.code !== 'domain_already_in_use') {
      logError('api:domains', 'erro ao adicionar domínio na Vercel', added.data)
      return NextResponse.json({ error: added.data?.error?.message || 'Não foi possível adicionar o domínio agora.' }, { status: 502 })
    }
    if (est.custom_domain && est.custom_domain !== domain) {
      await vercel(`/v9/projects/${cfg.projectId}/domains/${est.custom_domain}`, { method: 'DELETE' })
    }
  }

  const { error } = await admin.from('establishments').update({ custom_domain: domain }).eq('id', est.id)
  if (error) return NextResponse.json({ error: 'Erro ao salvar o domínio.' }, { status: 500 })

  return NextResponse.json({ domain, automatic: !!vercelConfig(), dns: dnsRecordFor(domain) })
}

export async function DELETE() {
  const est = await getOwnerEstablishment()
  if (!est) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (est.custom_domain && vercelConfig()) {
    const cfg = vercelConfig()!
    await vercel(`/v9/projects/${cfg.projectId}/domains/${est.custom_domain}`, { method: 'DELETE' })
  }
  const admin = createAdminClient()
  await admin.from('establishments').update({ custom_domain: null }).eq('id', est.id)
  return NextResponse.json({ domain: null })
}
