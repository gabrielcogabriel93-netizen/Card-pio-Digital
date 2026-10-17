import { ImageResponse } from 'next/og'
import { getPublicEstablishment } from '@/lib/storePublicData'
import { generateColorShades } from '@/lib/theme'

// Prévia do link (WhatsApp, Instagram, Facebook): 1200x630 com o logo, o
// nome, a cor e a descrição da LOJA e uma chamada "Peça aqui". Nada da
// marca da plataforma.
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const revalidate = 3600
export const alt = 'Cardápio da loja'

const rgb = (triplet: string) => `rgb(${triplet.split(' ').join(',')})`

export default async function OgImage({ params }: { params: { slug: string } }) {
  const establishment = await getPublicEstablishment(params.slug)
  const name = establishment?.name || 'Cardápio'
  const shades = generateColorShades(establishment?.theme_color)
  const main = rgb(shades[500])
  const dark = rgb(shades[800])
  const description = (establishment?.description || 'Cardápio completo, entrega e retirada.').slice(0, 110)
  // Satori não lê WebP: o logo só entra quando é PNG/JPEG.
  const logo = establishment?.logo_url && !/\.webp(\?|$)/i.test(establishment.logo_url) ? establishment.logo_url : null
  const delivery =
    establishment?.delivery_time_min || establishment?.delivery_time_max
      ? `Entrega em ${establishment.delivery_time_min || establishment.delivery_time_max}${establishment.delivery_time_max && establishment.delivery_time_min && establishment.delivery_time_max !== establishment.delivery_time_min ? `–${establishment.delivery_time_max}` : ''} min`
      : establishment?.offers_delivery === false
        ? 'Retirada no local'
        : 'Entrega e retirada'

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          padding: '64px 72px',
          background: `linear-gradient(120deg, ${main} 0%, ${dark} 100%)`,
          color: 'white',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            width: 260,
            height: 260,
            borderRadius: 56,
            background: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            overflow: 'hidden',
            boxShadow: '0 24px 60px rgba(0,0,0,.25)',
          }}
        >
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} width={260} height={260} style={{ objectFit: 'cover' }} alt="" />
          ) : (
            <span style={{ fontSize: 140, fontWeight: 800, color: main }}>{name.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 56, flex: 1 }}>
          <div style={{ fontSize: name.length > 22 ? 64 : 80, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2 }}>{name}</div>
          <div style={{ fontSize: 32, opacity: 0.92, marginTop: 18, lineHeight: 1.25 }}>{description}</div>
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 34 }}>
            <div style={{ background: '#FFD43B', color: '#14172B', fontSize: 34, fontWeight: 800, padding: '14px 30px', borderRadius: 18 }}>Peça aqui →</div>
            <div style={{ fontSize: 28, marginLeft: 24, opacity: 0.9 }}>{delivery}</div>
          </div>
        </div>
      </div>
    ),
    size
  )
}
