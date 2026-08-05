import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPlatformAdminUser } from '@/lib/platformAdmin'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'

// Extrato de comissões pro admin, com filtro opcional de período
// (?from=YYYY-MM-DD&to=YYYY-MM-DD). Lê `comissoes`, que é só o espelho
// local do que a Stripe já processou (ver app/api/stripe/webhook) -- não
// existe fila de pagamento pra reprocessar aqui, a Stripe já pagou.
export async function GET(request: NextRequest) {
  const adminUser = await getPlatformAdminUser()
  if (!adminUser) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const admin = createAdminClient()

  try {
    let query = admin
      .from('comissoes')
      .select('id, criado_em, valor_assinatura, percentual_aplicado, valor_comissao, status, divulgadores(nome), establishments(name)')
      .order('criado_em', { ascending: false })

    if (from) query = query.gte('criado_em', new Date(from).toISOString())
    if (to) query = query.lte('criado_em', new Date(to).toISOString())

    const { data, error } = await query
    if (error) throw error

    const rows = (data || []).map((c: any) => ({
      id: c.id,
      criadoEm: c.criado_em,
      divulgadorNome: c.divulgadores?.nome || '—',
      estabelecimentoNome: c.establishments?.name || '—',
      valorAssinatura: Number(c.valor_assinatura),
      percentualAplicado: Number(c.percentual_aplicado),
      valorComissao: Number(c.valor_comissao),
      status: c.status,
    }))

    return NextResponse.json({ comissoes: rows })
  } catch (err) {
    logError('api:admin:divulgadores:comissoes', 'erro ao carregar extrato', err)
    return NextResponse.json({ error: 'Erro ao carregar extrato' }, { status: 500 })
  }
}
