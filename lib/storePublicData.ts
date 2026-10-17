import { cache } from 'react'
import { createPublicClient } from '@/lib/supabase/public'
import type { PublicEstablishment } from '@/types'

// Uma consulta por request, compartilhada entre página, metadados,
// imagem de prévia e manifest (React cache deduplica).
export const getPublicEstablishment = cache(async (slug: string): Promise<PublicEstablishment | null> => {
  const supabase = createPublicClient()
  const { data } = await supabase.from('public_establishments').select('*').eq('slug', slug).maybeSingle()
  return (data as PublicEstablishment | null) || null
})
