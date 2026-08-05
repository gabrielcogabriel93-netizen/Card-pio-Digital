import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { log, logError } from '@/lib/logger'

export const runtime = 'nodejs'

// Chamada logo depois que um estabelecimento é criado (app/cadastro e
// app/completar-cadastro, os dois únicos lugares que criam uma loja),
// com o código do cookie `ref` (se existir -- ver middleware.ts). Nunca
// pública sem sessão: a sessão do lojista recém-criado é quem identifica
// qual estabelecimento vincular, o client nunca manda o
// estabelecimento_id direto (evita indicação forjada pra loja de
// outra pessoa).
//
// Idempotente e imutável por construção: `indicacoes.estabelecimento_id`
// é UNIQUE (migration 034) e não existe policy de UPDATE/DELETE pra
// ninguém -- uma segunda chamada pro mesmo estabelecimento simplesmente
// não faz nada.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const codigoAfiliado = String(body?.codigoAfiliado || '').trim().toUpperCase()
    if (!codigoAfiliado) {
      return NextResponse.json({ linked: false })
    }

    const admin = createAdminClient()

    const { data: establishment } = await admin
      .from('establishments')
      .select('id')
      .eq('owner_id', user.id)
      .maybeSingle()
    if (!establishment) {
      return NextResponse.json({ error: 'Estabelecimento não encontrado' }, { status: 404 })
    }

    const { data: divulgador } = await admin
      .from('divulgadores')
      .select('id, email, status')
      .eq('codigo_afiliado', codigoAfiliado)
      .maybeSingle()

    if (!divulgador || divulgador.status !== 'ativo') {
      log('api:indicacao:vincular', 'código de afiliado inválido ou inativo', { codigoAfiliado })
      return NextResponse.json({ linked: false })
    }

    // Bloqueia auto-indicação: o dono do estabelecimento não pode ser o
    // próprio divulgador que o "indicou".
    if (divulgador.email.toLowerCase() === (user.email || '').toLowerCase()) {
      log('api:indicacao:vincular', 'auto-indicação bloqueada', { userId: user.id })
      return NextResponse.json({ linked: false })
    }

    const { error: insertError } = await admin
      .from('indicacoes')
      .insert({ divulgador_id: divulgador.id, estabelecimento_id: establishment.id })

    if (insertError) {
      // 23505 = unique_violation em estabelecimento_id -> esse
      // estabelecimento já tem um divulgador vinculado (ex: rota chamada
      // duas vezes, ou dono já tinha loja de antes) -- vínculo é
      // imutável por construção, então só ignora.
      if (insertError.code === '23505') {
        return NextResponse.json({ linked: false })
      }
      throw insertError
    }

    log('api:indicacao:vincular', 'indicação vinculada', { divulgadorId: divulgador.id, establishmentId: establishment.id })
    return NextResponse.json({ linked: true })
  } catch (err) {
    logError('api:indicacao:vincular', 'erro ao vincular indicação', err)
    return NextResponse.json({ error: 'Erro ao vincular indicação' }, { status: 500 })
  }
}
