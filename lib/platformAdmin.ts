import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'

// Lista de e-mails autorizados a acessar /admin (dono da plataforma, não
// dono de estabelecimento) — separada por vírgula, nunca NEXT_PUBLIC_
// porque não precisa (e não deve) chegar no bundle do navegador.
function getAdminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export function isPlatformAdminEmail(email?: string | null): boolean {
  if (!email) return false
  return getAdminEmails().includes(email.toLowerCase())
}

// Confirma, a partir do cookie de sessão, que quem está chamando a rota é
// o dono da plataforma — usada em toda rota /api/admin/**. Repetida em
// cada rota de propósito (defesa em profundidade): o gate do
// app/admin/layout.tsx é só UX, quem garante a segurança de verdade é
// essa checagem em cada endpoint de servidor.
export async function getPlatformAdminUser() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isPlatformAdminEmail(user.email)) return null
  return user
}
