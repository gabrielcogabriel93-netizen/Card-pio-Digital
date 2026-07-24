import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'

// Confirma que o usuário logado (via cookie de sessão) é dono do
// establishment_id informado — usado nas rotas de API do WhatsApp pra
// ninguém conseguir mexer na sessão/enviar mensagem de outra loja.
export async function verifyEstablishmentOwner(establishmentId: string): Promise<boolean> {
  if (!establishmentId) return false
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { data } = await supabase
      .from('establishments')
      .select('id')
      .eq('id', establishmentId)
      .eq('owner_id', user.id)
      .maybeSingle()

    return !!data
  } catch {
    return false
  }
}
