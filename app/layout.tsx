import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Figtree, JetBrains_Mono, Caveat } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import PwaRegister from '@/components/PwaRegister'
import GlobalErrorTracker from '@/components/GlobalErrorTracker'
import { FeedbackHost } from '@/components/Feedback'
import { BRAND, iconUrl } from '@/lib/brand'
import './globals.css'

// Tipografia da marca: Bricolage Grotesque nos títulos, Figtree no texto,
// JetBrains Mono em números de pedido e valores, Caveat só em anotações.
const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display', display: 'swap' })
const body = Figtree({ subsets: ['latin'], variable: '--font-body', display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap', weight: ['500', '700'] })
const hand = Caveat({ subsets: ['latin'], variable: '--font-hand', display: 'swap', weight: ['600', '700'] })

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} - Cardápio digital com pedido direto e fidelidade`,
    template: `%s | ${BRAND.name}`,
  },
  description: `${BRAND.description} 7 dias grátis, com todas as funções liberadas.`,
  keywords: ['cardápio digital', 'cardápio online', 'pedidos whatsapp', 'delivery próprio', 'programa de fidelidade', 'menu digital'],
  authors: [{ name: BRAND.name }],
  creator: BRAND.name,
  manifest: '/manifest.json',
  // Ícones e título do app instalado: o cardápio de cada loja sobrescreve
  // com o logo e o nome dela (app/loja/[slug]/page.tsx).
  icons: {
    icon: [
      { url: iconUrl('/favicon.ico'), sizes: 'any' },
      { url: iconUrl('/icon.svg'), type: 'image/svg+xml' },
      { url: iconUrl('/icons/favicon-32x32.png'), sizes: '32x32', type: 'image/png' },
      { url: iconUrl('/icons/icon-192x192.png'), sizes: '192x192', type: 'image/png' },
    ],
    apple: iconUrl('/icons/apple-touch-icon.png'),
  },
  appleWebApp: {
    capable: true,
    title: BRAND.name,
    statusBarStyle: 'default',
  },
}

export const viewport: Viewport = {
  themeColor: BRAND.colors.blue,
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Sem maximumScale travado em 1: bloquear o pinch-to-zoom falha WCAG
  // 1.4.4 (Resize Text) e prejudica quem tem baixa visão.
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable} ${mono.variable} ${hand.variable}`}>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="font-sans antialiased">
        <PwaRegister />
        <GlobalErrorTracker />
        <main className="min-h-screen">{children}</main>
        <FeedbackHost />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
