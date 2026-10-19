import { ImageResponse } from 'next/og'
import { getPublicEstablishment } from '@/lib/storePublicData'
import { generateColorShades } from '@/lib/theme'

// Ícone do app instalado DA LOJA (tela de início do iPhone/Android, aba do
// navegador). Gerado aqui, quadrado e no tamanho exato, a partir do logo
// da loja; sem logo, a inicial do nome na cor da loja. Nunca o ícone da
// plataforma: o cliente vê a marca do lojista. Servido no mesmo domínio
// do cardápio (o iPhone ignora ícone de outro domínio com frequência).
export const runtime = 'edge'
export const revalidate = 3600

const SIZES = new Set([48, 96, 180, 192, 512])
const rgb = (triplet: string) => `rgb(${triplet.split(' ').join(',')})`

export async function GET(request: Request, { params }: { params: { slug: string; size: string } }) {
  const size = Number(params.size)
  if (!SIZES.has(size)) return new Response('Tamanho inválido', { status: 404 })
  const maskable = new URL(request.url).searchParams.get('maskable') === '1'

  const establishment = await getPublicEstablishment(params.slug)
  if (!establishment) return new Response('Loja não encontrada', { status: 404 })

  const shades = generateColorShades(establishment.theme_color)
  const main = rgb(shades[500])
  const dark = rgb(shades[700])
  // Satori não lê WebP nem SVG: nesses casos usa a inicial.
  const logo = establishment.logo_url && /\.(png|jpe?g)(\?|$)/i.test(establishment.logo_url) ? establishment.logo_url : null
  const initials = establishment.name
    .split(/\s+/)
    .filter((w) => w.length > 2 || /^[A-ZÀ-Ú]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || establishment.name[0]!.toUpperCase()
  // Android "maskable" corta as bordas: o conteúdo fica na zona segura (80%).
  const inner = maskable ? Math.round(size * 0.72) : size

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: logo ? '#ffffff' : `linear-gradient(135deg, ${main} 0%, ${dark} 100%)`,
        }}
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} width={inner} height={inner} style={{ objectFit: 'cover', borderRadius: maskable ? inner * 0.18 : 0 }} alt="" />
        ) : (
          <div style={{ display: 'flex', color: '#ffffff', fontSize: inner * (initials.length > 1 ? 0.42 : 0.56), fontWeight: 800, letterSpacing: -inner * 0.02 }}>
            {initials}
          </div>
        )}
      </div>
    ),
    {
      width: size,
      height: size,
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' },
    }
  )
}
