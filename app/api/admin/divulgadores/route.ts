import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPlatformAdminUser } from '@/lib/platformAdmin'
import { log, logError } from '@/lib/logger'

export const runtime = 'nodejs'

// Lista de divulgadores pro admin -- % de comissão editável, status do
// onboarding Stripe, indicações (total/ativas) e total já comissionado.
// Mesmo padrão de segurança de todo /api/admin/**: getPlatformAdminUser
// revalida o e-mail em cada rota (o gate em app/admin/layout.tsx é só
// UX).
export async function GET() {
  const adminUser = await getPlatformAdminUser()
  if (!adminUser) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  const admin = createAdminClient()

  try {
    const { data: divulgadores, error } = await admin
      .from('divulgadores')
      .select(
        `id, nome, email, codigo_afiliado, percentual_comissao, status, stripe_onboarding_completo, criado_em,
         indicacoes(id, establishments(subscription_status, current_period_end)),
         comissoes(valor_comissao, status)`
      )
      .order('criado_em', { ascending: false })
    if (error) throw error

    const now = Date.now()
    const rows = (divulgadores || []).map((d: any) => {
      const indicacoes = d.indicacoes || []
      const ativas = indicacoes.filter((i: any) => {
        const est = i.establishments
        return est?.subscription_status === 'active' && (!est?.current_period_end || new Date(est.current_period_end).getTime() > now)
      }).length
      const comissaoTotal = (d.comissoes || [])
        .filter((c: any) => c.status === 'confirmada')
        .reduce((sum: number, c: any) => sum + Number(c.valor_comissao), 0)

      return {
        id: d.id,
        nome: d.nome,
        email: d.email,
        codigoAfiliado: d.codigo_afiliado,
        percentualComissao: Number(d.percentual_comissao),
        status: d.status,
        onboardingComplete: d.stripe_onboarding_completo,
        criadoEm: d.criado_em,
        indicacoesTotal: indicacoes.length,
        indicacoesAtivas: ativas,
        comissaoTotal,
      }
    })

    return NextResponse.json({ divulgadores: rows })
  } catch (err) {
    logError('api:admin:divulgadores', 'erro ao listar divulgadores', err)
    return NextResponse.json({ error: 'Erro ao listar divulgadores' }, { status: 500 })
  }
}

// Edição pontual de percentual_comissao e/ou status -- não passa por
// nenhuma outra tabela (aditivo desde a migration 034).
export async function PATCH(request: NextRequest) {
  const adminUser = await getPlatformAdminUser()
  if (!adminUser) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const { id, percentualComissao, status } = body || {}
  if (!id) {
    return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (percentualComissao !== undefined) {
    const value = Number(percentualComissao)
    if (!Number.isFinite(value) || value <= 0 || value > 100) {
      return NextResponse.json({ error: 'percentualComissao inválido' }, { status: 400 })
    }
    update.percentual_comissao = value
  }
  if (status !== undefined) {
    if (status !== 'ativo' && status !== 'inativo') {
      return NextResponse.json({ error: 'status inválido' }, { status: 400 })
    }
    update.status = status
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 })
  }

  const admin = createAdminClient()

  try {
    const { error } = await admin.from('divulgadores').update(update).eq('id', id)
    if (error) throw error

    log('api:admin:divulgadores', 'divulgador atualizado', { admin: adminUser.email, id, update })
    return NextResponse.json({ ok: true })
  } catch (err) {
    logError('api:admin:divulgadores', 'erro ao atualizar divulgador', err)
    return NextResponse.json({ error: 'Erro ao atualizar divulgador' }, { status: 500 })
  }
}
