import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPlatformAdminEmail } from '@/lib/platformAdmin'

// Quem entra no /admin:
// - 'dono': e-mails de PLATFORM_ADMIN_EMAILS (Vercel). Vê tudo, liga a
//   cobrança, gerencia a equipe e é o único que recebe os avisos.
// - 'crescimento': e-mails cadastrados pelo dono em platform_team
//   (migration 057). Vê só a aba Crescimento (métricas, contatos,
//   suporte), sem mexer em cobrança nem em planos das lojas.
export type AdminRole = 'dono' | 'crescimento'

export interface AdminAccess {
  email: string
  role: AdminRole
}

export async function getAdminAccess(): Promise<AdminAccess | null> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const email = user?.email?.toLowerCase()
  if (!email) return null
  if (isPlatformAdminEmail(email)) return { email, role: 'dono' }

  const { data } = await createAdminClient().from('platform_team').select('email').eq('email', email).maybeSingle()
  return data ? { email, role: 'crescimento' } : null
}

/** Rotas da aba Crescimento: dono ou equipe. */
export async function requireGrowthAccess(): Promise<AdminAccess | null> {
  return getAdminAccess()
}

/** Rotas só do dono (equipe, avisos). */
export async function requireOwnerAccess(): Promise<AdminAccess | null> {
  const access = await getAdminAccess()
  return access?.role === 'dono' ? access : null
}
