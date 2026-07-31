import { NextResponse } from 'next/server'
import { getPlatformAdminUser } from '@/lib/platformAdmin'

export const runtime = 'nodejs'

// Só pra app/admin/layout.tsx decidir se redireciona ou não — a
// segurança de verdade é cada rota /api/admin/** revalidando o e-mail
// por conta própria, não confiar nesse check isolado.
export async function GET() {
  const user = await getPlatformAdminUser()
  if (!user) {
    return NextResponse.json({ isAdmin: false }, { status: 403 })
  }
  return NextResponse.json({ isAdmin: true })
}
