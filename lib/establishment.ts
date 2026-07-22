import type { SupabaseClient } from '@supabase/supabase-js'

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Cria o estabelecimento tentando o slug base e, em caso de conflito (slug já
 * em uso por outro tenant), acrescenta um sufixo numérico até encontrar um
 * livre. Evita que o cadastro falhe por causa de nomes de loja repetidos.
 */
export async function createEstablishmentWithUniqueSlug(
  supabase: SupabaseClient,
  params: { ownerId: string; name: string; whatsappNumber: string }
) {
  const baseSlug = slugify(params.name) || 'loja'
  let attempt = 0
  let lastError: any = null

  while (attempt < 8) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`

    const { data, error } = await supabase
      .from('establishments')
      .insert({
        owner_id: params.ownerId,
        name: params.name,
        slug,
        whatsapp_number: params.whatsappNumber,
        plan: 'free',
      })
      .select()
      .single()

    if (!error) return data

    // 23505 = unique_violation (slug já existe) -> tenta o próximo sufixo
    if (error.code === '23505') {
      lastError = error
      attempt++
      continue
    }

    throw error
  }

  throw lastError || new Error('Não foi possível gerar um link único para a loja.')
}
