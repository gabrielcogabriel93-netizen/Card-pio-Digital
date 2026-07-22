import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request)
  const pathname = request.nextUrl.pathname

  // Rotas protegidas do painel
  const isProtectedRoute =
    pathname.startsWith('/painel') || pathname.startsWith('/completar-cadastro')

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
