// Lê NEXT_PUBLIC_APP_URL removendo a barra final, se tiver uma — evita
// URLs com barra dupla (ex: "https://app.com//loja/slug") em sitemap,
// robots.txt e dados estruturados, já que é fácil colar a URL do Vercel
// com "/" no final sem perceber.
export function getBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return url.replace(/\/+$/, '')
}
