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

// CSP + demais headers de segurança, aplicados a TODAS as páginas exceto
// /api/** (rotas de API não renderizam HTML — a única exceção,
// /api/mercadopago/oauth/start, seta o próprio CSP com nonce, ver o
// comentário nesse arquivo). Mantido num objeto por diretiva pra ficar
// fácil de auditar/ajustar sem reescrever a string toda.
const connectSrcHosts = [
  "'self'",
  supabaseHost ? `https://${supabaseHost}` : '',
  supabaseHost ? `wss://${supabaseHost}` : '', // Supabase Realtime (painel/pedidos, acompanhamento do pedido)
  'https://viacep.com.br', // busca de endereço por CEP no checkout
].filter(Boolean).join(' ')

const imgSrcHosts = ["'self'", 'data:', supabaseHost ? `https://${supabaseHost}` : ''].filter(Boolean).join(' ')

const CSP_DIRECTIVES = [
  `default-src 'self'`,
  `script-src 'self'`,
  // 'unsafe-inline' aqui é necessário: a cor de marca por loja (lib/theme.ts)
  // é aplicada via CSS custom properties no atributo `style` do React —
  // não dá pra usar nonce num valor que muda por render sem reescrever
  // esse mecanismo. Não enfraquece script-src (continua estrito).
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
        // Todas as páginas, exceto /api/** — a única rota de API que serve
        // HTML de verdade (app/api/mercadopago/oauth/start) define o
        // próprio CSP com nonce por request; duplicar o header aqui faria
        // o navegador aplicar a INTERSEÇÃO das duas políticas e quebrar o
        // script inline dela (o nonce de uma nunca bate com o da outra).
        source: '/((?!api/).*)',
        headers: securityHeaders,
      },
    ]
  },
}

module.exports = nextConfig
