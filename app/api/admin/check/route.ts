import { NextResponse } from 'next/server'
import { getAdminAccess } from '@/lib/adminAccess'

export const runtime = 'nodejs'

// Só pra app/admin/layout.tsx decidir se redireciona e quais abas mostrar
// — a segurança de verdade é cada rota /api/admin/** revalidando o acesso
// por conta própria, não confiar nesse check isolado.
export async function GET() {
  const access = await getAdminAccess()
  if (!access) {
    return NextResponse.json({ isAdmin: false }, { status: 403 })
  }
  return NextResponse.json({ isAdmin: true, role: access.role, email: access.email })
}
