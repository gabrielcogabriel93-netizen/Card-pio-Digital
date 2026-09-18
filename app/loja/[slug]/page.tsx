import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public'
import type { PublicEstablishment, Category, PublicProduct, PublicCombo } from '@/types'
import PublicMenuClient from './PublicMenuClient'
import { getBaseUrl } from '@/lib/baseUrl'
import { Store } from 'lucide-react'

// Recarrega os dados do cardápio a cada 30s no máximo — rápido o
// suficiente para refletir mudanças de produto/preço, mas evita bater no
// banco a cada visita (cardápios costumam ter bastante tráfego repetido).
export const revalidate = 30

async function getEstablishment(slug: string): Promise<PublicEstablishment | null> {
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('public_establishments')
    .select('*')
    .eq('slug', slug)
    .single()
  return data
}

async function getMenu(establishmentId: string) {
  const supabase = createPublicClient()
  const [{ data: categories }, { data: products }, { data: bestsellers }, { data: combos }] = await Promise.all([
    supabase.from('categories').select('*').eq('establishment_id', establishmentId).order('display_order'),
    supabase.from('public_products').select('*').eq('establishment_id', establishmentId).order('display_order'),
    supabase.rpc('get_bestseller_products', { p_establishment_id: establishmentId, p_limit: 3 }),
    supabase.from('combos').select('*').eq('establishment_id', establishmentId).eq('is_active', true).order('display_order'),
  ])

  // "Mais vendido" é dado real (pedidos aceitos dos últimos 30 dias),
  // calculado no banco — nunca inventado. Se a loja é nova e não tem
  // histórico suficiente, simplesmente não marca ninguém.
  const bestsellerIds = new Set((bestsellers || []).map((b: { product_id: string }) => b.product_id))
  const productsWithBestsellers = ((products || []) as PublicProduct[]).map((p) => ({
    ...p,
    is_bestseller: bestsellerIds.has(p.id),
  }))

  return {
    categories: (categories || []) as Category[],
    products: productsWithBestsellers,
    combos: (combos || []) as PublicCombo[],
  }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const establishment = await getEstablishment(params.slug)

  if (!establishment) {
    return { title: 'Cardápio não encontrado' }
  }

  // Descrição configurada pelo lojista (Configurações > Dados do
  // Estabelecimento) tem prioridade — é o que ele quer que apareça
  // quando compartilha o link. Sem ela, cai numa descrição genérica.
  const description = establishment.description?.trim()
    || `Confira o cardápio de ${establishment.name} e faça seu pedido direto pelo WhatsApp.`

  return {
    title: establishment.name,
    description,
    openGraph: {
      title: establishment.name,
      description,
      images: establishment.logo_url ? [{ url: establishment.logo_url }] : undefined,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: establishment.name,
      description,
      images: establishment.logo_url ? [establishment.logo_url] : undefined,
    },
  }
}

export default async function PublicMenuPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { mesa?: string }
}) {
  const establishment = await getEstablishment(params.slug)

  if (!establishment) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <Store size={48} className="text-gray-300 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Cardápio não encontrado</h1>
          <p className="text-gray-600">O link que você acessou não existe ou foi desativado.</p>
        </div>
      </div>
    )
  }

  const { categories, products, combos } = await getMenu(establishment.id)

  // Dados estruturados (schema.org) pra buscadores entenderem que é um
  // estabelecimento comercial com cardápio — LocalBusiness serve pra
  // qualquer tipo de loja (não só restaurante), já que o app atende
  // desde pizzaria até loja de roupa.
  const baseUrl = getBaseUrl()
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: establishment.name,
    url: `${baseUrl}/loja/${establishment.slug}`,
    ...(establishment.logo_url && { image: establishment.logo_url }),
    ...(establishment.description && { description: establishment.description }),
    ...(establishment.address && { address: establishment.address }),
    ...(establishment.whatsapp_number && { telephone: establishment.whatsapp_number }),
  }

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PublicMenuClient
        establishment={establishment}
        categories={categories}
        products={products}
        combos={combos}
        tableIdParam={searchParams?.mesa || null}
      />
    </>
  )
}
