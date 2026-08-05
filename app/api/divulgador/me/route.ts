import { NextResponse } from 'next/server'
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAccountReadyForTransfers } from '@/lib/stripe'
import { getBaseUrl } from '@/lib/baseUrl'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'

// Dado principal do painel do divulgador: perfil, link de afiliado,
// indicações com status da assinatura de cada uma, e comissões do mês
// atual + histórico. Só lê a linha do próprio divulgador logado (RLS já
// garante isso pra qualquer client, aqui é service role mas a consulta
// já filtra por user_id de qualquer forma).
export async function GET() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const admin = createAdminClient()

  try {
    const { data: divulgador, error: divError } = await admin
      .from('divulgadores')
      .select('id, nome, codigo_afiliado, percentual_comissao, status, stripe_account_id, stripe_onboarding_completo')
      .eq('user_id', user.id)
      .maybeSingle()
    if (divError) throw divError
    if (!divulgador) {
      return NextResponse.json({ error: 'Perfil de divulgador não encontrado' }, { status: 404 })
    }

    // Reconcilia com a Stripe de verdade (não confia só no retorno da
    // return_url do Account Link -- o divulgador pode ter fechado a aba
    // antes de terminar).
    let onboardingComplete = divulgador.stripe_onboarding_completo
    if (!onboardingComplete && divulgador.stripe_account_id) {
      onboardingComplete = await isAccountReadyForTransfers(divulgador.stripe_account_id)
      if (onboardingComplete) {
        await admin.from('divulgadores').update({ stripe_onboarding_completo: true }).eq('id', divulgador.id)
      }
    }

    const { data: indicacoesRaw, error: indError } = await admin
      .from('indicacoes')
      .select('id, criado_em, estabelecimento_id, establishments(name, subscription_status, current_period_end)')
      .eq('divulgador_id', divulgador.id)
      .order('criado_em', { ascending: false })
    if (indError) throw indError

    const now = Date.now()
    const indicacoes = (indicacoesRaw || []).map((row: any) => {
      const est = row.establishments
      const ativo = est?.subscription_status === 'active' && (!est?.current_period_end || new Date(est.current_period_end).getTime() > now)
      return {
        id: row.id,
        criadoEm: row.criado_em,
        estabelecimentoNome: est?.name || 'Estabelecimento',
        ativo,
      }
    })

    const { data: comissoesRaw, error: comError } = await admin
      .from('comissoes')
      .select('id, criado_em, valor_comissao, status, estabelecimento_id, establishments(name)')
      .eq('divulgador_id', divulgador.id)
      .order('criado_em', { ascending: false })
    if (comError) throw comError

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const historico = (comissoesRaw || []).map((row: any) => ({
      id: row.id,
      criadoEm: row.criado_em,
      valor: Number(row.valor_comissao),
      status: row.status,
      estabelecimentoNome: row.establishments?.name || 'Estabelecimento',
    }))

    const comissaoMesAtual = historico
      .filter((c) => c.status === 'confirmada' && new Date(c.criadoEm) >= startOfMonth)
      .reduce((sum, c) => sum + c.valor, 0)

    return NextResponse.json({
      nome: divulgador.nome,
      codigoAfiliado: divulgador.codigo_afiliado,
      percentualComissao: Number(divulgador.percentual_comissao),
      status: divulgador.status,
      onboardingComplete,
      linkAfiliado: `${getBaseUrl()}/cadastro?ref=${divulgador.codigo_afiliado}`,
      indicacoes,
      comissaoMesAtual,
      historico,
    })
  } catch (err) {
    logError('api:divulgador:me', 'erro ao carregar painel do divulgador', err)
    return NextResponse.json({ error: 'Erro ao carregar dados' }, { status: 500 })
  }
}
