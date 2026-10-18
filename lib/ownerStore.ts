import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Loja do usuário logado (rotas de servidor do painel). Devolve null se
 * não houver sessão ou loja: quem chama responde 401.
 */
export async function getOwnerStore<T = Record<string, any>>(columns: string): Promise<T | null> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data } = await supabase.from('establishments').select(columns).eq('owner_id', user.id).maybeSingle()
    return (data as T) || null
  } catch {
    return null
  }
}

/** IP do cliente atrás da Vercel (primeiro da lista do x-forwarded-for). */
export function clientIp(headers: Headers): string {
  return (headers.get('x-forwarded-for') || '').split(',')[0].trim() || headers.get('x-real-ip') || 'desconhecido'
}
