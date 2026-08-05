import type { SupabaseClient } from '@supabase/supabase-js'
import { slugify } from '@/lib/establishment'

/**
 * Gera um código de afiliado a partir do nome (ex: "João Silva" ->
 * "JOAOSILVA2026") e, em caso de conflito, acrescenta um sufixo
 * numérico até achar um livre -- mesma estratégia de
 * createEstablishmentWithUniqueSlug (lib/establishment.ts), só que pro
 * código de divulgador em vez do slug da loja.
 */
export async function generateUniqueAffiliateCode(supabase: SupabaseClient, nome: string): Promise<string> {
  const base = (slugify(nome) || 'divulgador').replace(/-/g, '').toUpperCase().slice(0, 16)
  const year = new Date().getFullYear()

  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = attempt === 0 ? `${base}${year}` : `${base}${year}${attempt + 1}`

    const { data: existing } = await supabase
      .from('divulgadores')
      .select('id')
      .eq('codigo_afiliado', candidate)
      .maybeSingle()

    if (!existing) return candidate
  }

  throw new Error('Não foi possível gerar um código de afiliado único.')
}
