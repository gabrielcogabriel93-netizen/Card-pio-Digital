import { NextRequest, NextResponse } from 'next/server'
import { getPublicEstablishment } from '@/lib/storePublicData'
import { storeColor } from '@/lib/brand'
import { storeIconUrl } from '@/lib/storeIcon'

// App instalável DA LOJA: quem coloca o cardápio na tela inicial ganha um
// ícone com o logo e o nome da loja, que abre direto no cardápio. Antes o
// manifest era único e o atalho abria a página da plataforma.
export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  const establishment = await getPublicEstablishment(params.slug)
  if (!establishment) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // No domínio da própria loja (ou subdomínio), o cardápio está na raiz.
  const host = request.headers.get('host') || ''
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN
  const onStoreHost = !!establishment.custom_domain && host.startsWith(establishment.custom_domain)
  const onSubdomain = !!rootDomain && host.toLowerCase().startsWith(`${establishment.slug}.${rootDomain}`)
  const startUrl = onStoreHost || onSubdomain ? '/' : `/loja/${establishment.slug}`

  // Sempre o ícone DA LOJA (logo ou inicial na cor dela), nunca o da plataforma.
  const icons = [
    { src: storeIconUrl(establishment, 192), sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: storeIconUrl(establishment, 512), sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: storeIconUrl(establishment, 512, true), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ]

  return NextResponse.json(
    {
      id: `/loja/${establishment.slug}`,
      name: establishment.name,
      short_name: establishment.name.slice(0, 12),
      description: establishment.description || `Peça online na ${establishment.name}`,
      start_url: startUrl,
      // Escopo amplo: acompanhar o pedido (/pedido/...) continua dentro do app.
      scope: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: storeColor(establishment.theme_color),
      orientation: 'portrait-primary',
      lang: 'pt-BR',
      icons,
    },
    { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=300' } }
  )
}
