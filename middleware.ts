import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Domínio próprio (migration 024): se o lojista apontou um domínio dele
// pro app (CNAME + cadastro manual na Vercel, ver README), qualquer
// acesso por esse host precisa cair direto no cardápio público daquela
// loja, sem passar pelo /loja/[slug]. Resolve via view pública (sem
// service role) pra não vazar coluna nenhuma além do necessário.
async function resolveCustomDomainSlug(hostname: string): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) return null

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/public_establishments?custom_domain=eq.${encodeURIComponent(hostname)}&select=slug`,
      {
        headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
        cache: 'no-store',
      }
    )
    if (!res.ok) return null
    const rows: { slug: string }[] = await res.json()
    return rows[0]?.slug || null
  } catch (err) {
    console.error('Erro ao resolver domínio próprio no middleware:', err)
    return null
  }
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const hostname = request.headers.get('host')?.split(':')[0] || ''
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN

  // Só tenta resolver domínio próprio quando o host não é o domínio
  // principal do app nem um preview da Vercel — evita uma consulta ao
  // Supabase em toda requisição normal do painel/cardápio padrão.
  const isKnownHost =
    !rootDomain ||
    hostname === rootDomain ||
    hostname === 'localhost' ||
    hostname.endsWith('.vercel.app')

  if (!isKnownHost && !pathname.startsWith('/api') && !pathname.startsWith('/loja')) {
    const slug = await resolveCustomDomainSlug(hostname)
    if (slug) {
      const url = request.nextUrl.clone()
      url.pathname = `/loja/${slug}${pathname === '/' ? '' : pathname}`
      return NextResponse.rewrite(url)
    }
  }

  const { supabaseResponse, user } = await updateSession(request)

  // Rotas protegidas do painel
  const isProtectedRoute =
    pathname.startsWith('/painel') ||
    pathname.startsWith('/completar-cadastro') ||
    pathname.startsWith('/onboarding') ||
    pathname.startsWith('/admin')

  if (isProtectedRoute) {
    if (!user) {
      console.log(`[middleware] ${pathname} protegida, sem usuário -> redirecionando para /login`)
      const redirectUrl = new URL('/login', request.url)
      redirectUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(redirectUrl)
    }
  }

  // Redirecionar usuário logado para o painel se tentar acessar login/cadastro
  if (user && (pathname === '/login' || pathname === '/cadastro')) {
    console.log(`[middleware] usuário já logado em ${pathname} -> redirecionando para /painel`)
    return NextResponse.redirect(new URL('/painel', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
