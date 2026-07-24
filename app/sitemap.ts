import type { MetadataRoute } from 'next'
import { createPublicClient } from '@/lib/supabase/public'
import { getBaseUrl } from '@/lib/baseUrl'

// Gera /sitemap.xml com a home + o cardápio público de cada loja, pra
// mecanismo de busca descobrir as lojas sem depender só de link direto.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getBaseUrl()

  const supabase = createPublicClient()
  const { data: establishments } = await supabase
    .from('public_establishments')
    .select('slug')

  const storeEntries: MetadataRoute.Sitemap = (establishments || []).map((e) => ({
    url: `${baseUrl}/loja/${e.slug}`,
    changeFrequency: 'daily',
    priority: 0.8,
  }))

  return [
    { url: baseUrl, changeFrequency: 'weekly', priority: 1 },
    { url: `${baseUrl}/cadastro`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/login`, changeFrequency: 'monthly', priority: 0.3 },
    ...storeEntries,
  ]
}
