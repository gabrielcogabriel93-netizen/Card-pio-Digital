import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import PwaRegister from '@/components/PwaRegister'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    default: 'Cardápio SaaS - Cardápio Digital Grátis',
    template: '%s | Cardápio SaaS',
  },
  description:
    'Crie seu cardápio digital grátis e receba pedidos direto no WhatsApp. Ideal para restaurantes, pizzarias, lanchonetes e muito mais.',
  keywords: [
    'cardápio digital',
    'cardápio online',
    'pedidos whatsapp',
    'saas cardápio',
    'menu digital',
  ],
  authors: [{ name: 'Cardápio SaaS' }],
  creator: 'Cardápio SaaS',
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/icon-192x192.png',
    apple: '/icons/icon-192x192.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#22c55e',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Cardápio SaaS" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className={inter.className}>
        <PwaRegister />
        <main className="min-h-screen">{children}</main>
      </body>
    </html>
  )
}
