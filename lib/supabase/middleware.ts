import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Sem as variáveis de ambiente configuradas (ex: esquecidas no deploy da
  // Vercel), não dá pra checar sessão — mas o site não pode derrubar todas
  // as rotas com 500 por causa disso. Deixa passar sem usuário; as rotas
  // protegidas simplesmente tratam como "não logado".
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      'Supabase env vars ausentes (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY). ' +
      'Configure-as nas Environment Variables do projeto e refaça o deploy.'
    )
    return { supabaseResponse, user: null, supabase: null }
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        )
        supabaseResponse = NextResponse.next({
          request,
        })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    // Devolve o client também — deixa quem chamou (ex: middleware.ts
    // decidindo pra onde mandar um usuário logado na landing page) fazer
    // mais consultas reaproveitando a MESMA sessão, sem montar um client
    // novo. Importante que seja este client (não um com a anon key crua):
    // é o que carrega o JWT do usuário, então RLS baseada em auth.uid()
    // funciona certo.
    return {
      supabaseResponse,
      user,
      supabase,
    }
  } catch (err) {
    // Falha de rede/Supabase fora do ar não pode derrubar o site inteiro.
    console.error('Erro ao verificar sessão no middleware:', err)
    return { supabaseResponse, user: null, supabase: null }
  }
}
