import type { MetadataRoute } from 'next'
import { getBaseUrl } from '@/lib/baseUrl'

// Dinâmico em vez de public/robots.txt estático porque precisa apontar
// pro sitemap com a URL real do deploy (NEXT_PUBLIC_APP_URL) — um
// arquivo estático deixaria a URL do sitemap errada/hardcoded.
export default function robots(): MetadataRoute.Robots {
  const baseUrl = getBaseUrl()

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/painel', '/completar-cadastro', '/onboarding'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
