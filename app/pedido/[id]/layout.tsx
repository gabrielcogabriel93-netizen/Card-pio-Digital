import type { Metadata, Viewport } from 'next'
import { createPublicClient } from '@/lib/supabase/public'
import { getPublicEstablishment } from '@/lib/storePublicData'
import { storeIconUrl } from '@/lib/storeIcon'
import { storeColor } from '@/lib/brand'

// A página do pedido é onde o cliente costuma "Adicionar à Tela de Início"
// (o convite aparece logo depois do pedido). Sem isto, o iPhone instalava
// com o ícone e o nome da plataforma; agora instala o app DA LOJA.
async function storeOfOrder(orderId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return null
  try {
    const { data } = await createPublicClient().rpc('get_order_status', { p_order_id: orderId })
    const slug = (Array.isArray(data) ? data[0] : data)?.establishment_slug as string | undefined
    return slug ? await getPublicEstablishment(slug) : null
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const store = await storeOfOrder(params.id)
  if (!store) return { title: { absolute: 'Acompanhe seu pedido' }, robots: { index: false } }
  return {
    title: { absolute: `Seu pedido · ${store.name}` },
    robots: { index: false },
    manifest: `/loja/${store.slug}/manifest.webmanifest`,
    icons: {
      icon: [{ url: storeIconUrl(store, 192), sizes: '192x192', type: 'image/png' }],
      apple: { url: storeIconUrl(store, 180), sizes: '180x180', type: 'image/png' },
    },
    appleWebApp: { capable: true, title: store.name, statusBarStyle: 'default' },
  }
}

export async function generateViewport({ params }: { params: { id: string } }): Promise<Viewport> {
  const store = await storeOfOrder(params.id)
  return { themeColor: store ? storeColor(store.theme_color) : '#ffffff', viewportFit: 'cover' }
}

export default function PedidoLayout({ children }: { children: React.ReactNode }) {
  return children
}
