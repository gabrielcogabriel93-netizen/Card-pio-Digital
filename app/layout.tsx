import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import PwaRegister from '@/components/PwaRegister'
import GlobalErrorTracker from '@/components/GlobalErrorTracker'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    default: 'CatalogAI - Cardápio Digital com 7 Dias Grátis',
    template: '%s | CatalogAI',
  },
  description:
    'Crie seu cardápio digital e receba pedidos direto no WhatsApp. 7 dias grátis, com todas as funções liberadas. Ideal para restaurantes, pizzarias, lanchonetes e muito mais.',
  keywords: [
    'cardápio digital',
    'cardápio online',
    'pedidos whatsapp',
    'saas cardápio',
    'menu digital',
  ],
  authors: [{ name: 'CatalogAI' }],
  creator: 'CatalogAI',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icons/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#22c55e',
  width: 'device-width',
  initialScale: 1,
  // Sem maximumScale travado em 1: bloquear o pinch-to-zoom falha WCAG
  // 1.4.4 (Resize Text) e prejudica quem tem baixa visão — deixa o
  // navegador decidir o zoom máximo (padrão dele já é generoso).
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="CatalogAI" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className={inter.className}>
        <PwaRegister />
        <GlobalErrorTracker />
        <main className="min-h-screen">{children}</main>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
