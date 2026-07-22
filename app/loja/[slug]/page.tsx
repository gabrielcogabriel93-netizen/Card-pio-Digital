import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public'
import type { PublicEstablishment, Category, PublicProduct } from '@/types'
import PublicMenuClient from './PublicMenuClient'
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
  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase.from('categories').select('*').eq('establishment_id', establishmentId).order('display_order'),
    supabase.from('public_products').select('*').eq('establishment_id', establishmentId).order('display_order'),
  ])
  return {
    categories: (categories || []) as Category[],
    products: (products || []) as PublicProduct[],
  }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const establishment = await getEstablishment(params.slug)

  if (!establishment) {
    return { title: 'Cardápio não encontrado' }
  }

  const description = `Confira o cardápio de ${establishment.name} e faça seu pedido direto pelo WhatsApp.`

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

export default async function PublicMenuPage({ params }: { params: { slug: string } }) {
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

  const { categories, products } = await getMenu(establishment.id)

  return <PublicMenuClient establishment={establishment} categories={categories} products={products} />
}
