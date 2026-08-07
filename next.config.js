/** @type {import('next').NextConfig} */

// Hostname do projeto Supabase (derivado de NEXT_PUBLIC_SUPABASE_URL) — é o
// único host externo de onde o app carrega imagem de verdade (logo/produto
// via Supabase Storage, ver components/ImageUpload.tsx). Restringir o
// remotePatterns a ele (em vez do "**" antigo, que liberava QUALQUER
// hostname https) fecha o /_next/image como proxy aberto — ver GHSA-9g9p-9gw9-jx7f
// e a advisory irmã de DoS via Image Optimizer com remotePatterns amplo demais.
function supabaseImageHostname() {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').hostname || null
  } catch {
    return null
  }
}

const supabaseHost = supabaseImageHostname()

const remotePatterns = supabaseHost
  ? [{ protocol: 'https', hostname: supabaseHost, pathname: '/storage/v1/object/public/**' }]
  : []

// CSP + demais headers de segurança, aplicados a todas as páginas exceto
// /api/** (rotas de API não renderizam HTML — a única exceção,
// /api/mercadopago/oauth/start, monta o próprio CSP isolado com nonce
// próprio pra aquele <script> específico).
//
// script-src leva 'unsafe-inline' de propósito, depois de testar ao vivo:
// tentamos um CSP com nonce por request (gerado no middleware) seguindo o
// padrão oficial do Next para App Router, mas nessa versão (14.2.35) os
// scripts inline que o PRÓPRIO Next injeta pra streaming de Server
// Components (`self.__next_f.push(...)`) não recebem esse nonce de forma
// confiável em modo produção — resultado: a hidratação inteira quebrava
// (login, formulários, tudo que depende de JS parava de funcionar).
// 'self' continua bloqueando script de QUALQUER outra origem, que é a
// parte que importa contra XSS via terceiros; o app não tem nenhum ponto
// que renderiza HTML não-escapado vindo de usuário (o único
// dangerouslySetInnerHTML é o JSON-LD, JSON.stringify'd, não executável).
const connectSrcHosts = [
  "'self'",
  supabaseHost ? `https://${supabaseHost}` : '',
  supabaseHost ? `wss://${supabaseHost}` : '', // Supabase Realtime (painel/pedidos, acompanhamento do pedido)
  'https://viacep.com.br', // busca de endereço por CEP no checkout
].filter(Boolean).join(' ')

const imgSrcHosts = ["'self'", 'data:', supabaseHost ? `https://${supabaseHost}` : ''].filter(Boolean).join(' ')

const CSP_DIRECTIVES = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src ${imgSrcHosts}`,
  `font-src 'self' data:`,
  `connect-src ${connectSrcHosts}`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `object-src 'none'`,
  `upgrade-insecure-requests`,
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: CSP_DIRECTIVES },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // HSTS só faz sentido atrás de HTTPS de verdade (Vercel já força isso em
  // produção) — preload exige o domínio estar na lista do Chromium, então
  // fica de fora até isso ser cadastrado deliberadamente.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
]

const nextConfig = {
  images: {
    remotePatterns,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
  async headers() {
    return [
      {
        source: '/((?!api/).*)',
        headers: securityHeaders,
      },
    ]
  },
}

module.exports = nextConfig
