import { createClient } from '@supabase/supabase-js'

/**
 * Client "cru" com a chave anônima, sem cookies/sessão — usado para ler
 * dados públicos (cardápio) tanto no servidor (Server Component/generateMetadata)
 * quanto no navegador. Não serve para nada que dependa de usuário logado.
 */
export function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
