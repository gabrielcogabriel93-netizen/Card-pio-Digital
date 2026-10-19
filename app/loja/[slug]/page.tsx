import type { Metadata, Viewport } from 'next'
import { createPublicClient } from '@/lib/supabase/public'
import type { Category, PublicProduct, PublicCombo } from '@/types'
import PublicMenuClient from './PublicMenuClient'
import { getBaseUrl } from '@/lib/baseUrl'
import { getPublicEstablishment } from '@/lib/storePublicData'
import { publicStoreUrl } from '@/lib/domains'
import { Store } from 'lucide-react'
import { storeColor } from '@/lib/brand'
import { storeIconUrl } from '@/lib/storeIcon'

// Página estática regenerada a cada 30s (ISR). O ?mesa= do QR de mesa é
// lido no navegador (PublicMenuClient) para não forçar renderização
// dinâmica em toda visita.
export const revalidate = 30

// Nenhuma loja pré-gerada no build: cada uma é gerada no primeiro acesso
// e fica em cache (renovada a cada 30s).
export const dynamicParams = true
export function generateStaticParams() {
  return []
}

async function getMenu(establishmentId: string) {
  const supabase = createPublicClient()
  const [{ data: categories }, { data: products }, { data: bestsellers }, { data: combos }] = await Promise.all([
    supabase.from('categories').select('*').eq('establishment_id', establishmentId).order('display_order'),
    supabase.from('public_products').select('*').eq('establishment_id', establishmentId).order('display_order'),
    supabase.rpc('get_bestseller_products', { p_establishment_id: establishmentId, p_limit: 3 }),
    supabase.from('combos').select('*').eq('establishment_id', establishmentId).eq('is_active', true).order('display_order'),
  ])

  // "Mais pedido" é dado real (pedidos aceitos dos últimos 30 dias).
  const bestsellerIds = new Set((bestsellers || []).map((b: { product_id: string }) => b.product_id))
  const productsWithBestsellers = ((products || []) as PublicProduct[]).map((p) => ({ ...p, is_bestseller: bestsellerIds.has(p.id) }))

  return {
    categories: (categories || []) as Category[],
    products: productsWithBestsellers,
    combos: (combos || []) as PublicCombo[],
  }
}

export async function generateViewport({ params }: { params: { slug: string } }): Promise<Viewport> {
  const establishment = await getPublicEstablishment(params.slug)
  return { themeColor: storeColor(establishment?.theme_color), viewportFit: 'cover' }
}

// Link com a cara da loja: o título é só o nome dela (sem "| plataforma"),
// a prévia usa a imagem gerada em opengraph-image.tsx, e o ícone/app
// instalado usam o logo e o nome da loja.
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const establishment = await getPublicEstablishment(params.slug)
  if (!establishment) return { title: { absolute: 'Cardápio não encontrado' }, robots: { index: false } }

  const description =
    establishment.description?.trim() || `Peça online na ${establishment.name}: cardápio completo, entrega e retirada.`
  const url = publicStoreUrl({
    slug: establishment.slug,
    customDomain: establishment.custom_domain,
    rootDomain: process.env.NEXT_PUBLIC_ROOT_DOMAIN,
    baseUrl: getBaseUrl(),
  })

  return {
    title: { absolute: `${establishment.name} · Peça online` },
    description,
    alternates: { canonical: url },
    manifest: `/loja/${establishment.slug}/manifest.webmanifest`,
    // Ícone do app instalado e da aba: sempre a marca da LOJA, gerado no
    // mesmo domínio e quadrado (o iPhone usa o apple-touch-icon).
    icons: {
      icon: [
        { url: storeIconUrl(establishment, 48), sizes: '48x48', type: 'image/png' },
        { url: storeIconUrl(establishment, 192), sizes: '192x192', type: 'image/png' },
      ],
      apple: { url: storeIconUrl(establishment, 180), sizes: '180x180', type: 'image/png' },
    },
    appleWebApp: { capable: true, title: establishment.name, statusBarStyle: 'default' },
    openGraph: {
      title: `${establishment.name} · Peça online`,
      description,
      url,
      siteName: establishment.name,
      type: 'website',
      locale: 'pt_BR',
    },
    twitter: { card: 'summary_large_image', title: establishment.name, description },
  }
}

export default async function PublicMenuPage({ params }: { params: { slug: string } }) {
  const establishment = await getPublicEstablishment(params.slug)

  if (!establishment) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <Store size={48} className="text-gray-300 mx-auto mb-4" />
          <h1 className="font-display text-xl font-bold text-gray-900 mb-2">Cardápio não encontrado</h1>
          <p className="text-gray-600">O link que você acessou não existe ou foi desativado.</p>
        </div>
      </div>
    )
  }

  const { categories, products, combos } = await getMenu(establishment.id)

  // Dados estruturados (schema.org) para buscadores.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: establishment.name,
    url: publicStoreUrl({ slug: establishment.slug, customDomain: establishment.custom_domain, rootDomain: process.env.NEXT_PUBLIC_ROOT_DOMAIN, baseUrl: getBaseUrl() }),
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <PublicMenuClient establishment={establishment} categories={categories} products={products} combos={combos} renderedAt={new Date().toISOString()} />
    </>
  )
}
