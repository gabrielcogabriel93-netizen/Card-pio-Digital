// Regras de domínio da loja: domínio próprio (cardapio.loja.com.br) e
// subdomínio automático da plataforma (loja.plataforma.app).

const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/

export function normalizeDomainInput(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/^www\./, '')
    .replace(/\.$/, '')
}

export function isValidDomain(domain: string): boolean {
  return DOMAIN_RE.test(domain)
}

// Subdomínio (cardapio.loja.com.br) aponta com CNAME; domínio raiz
// (loja.com.br) usa registro A. ".com.br" tem dois níveis de sufixo.
export function dnsRecordFor(domain: string): { type: 'A' | 'CNAME'; name: string; value: string } {
  const parts = domain.split('.')
  const suffixLevels = /\.(com|net|org|art|blog|eco|ind|tec|app|dev)\.br$/.test(domain) ? 3 : 2
  if (parts.length > suffixLevels) {
    return { type: 'CNAME', name: parts.slice(0, parts.length - suffixLevels).join('.'), value: 'cname.vercel-dns.com' }
  }
  return { type: 'A', name: '@', value: '76.76.21.21' }
}

// Subdomínio automático: "bellamassa.fregues.app" -> "bellamassa".
// Devolve null para o próprio domínio raiz, www e hosts que não são da
// plataforma.
export function storeSlugFromSubdomain(hostname: string, rootDomain: string | undefined | null): string | null {
  if (!rootDomain) return null
  const host = hostname.toLowerCase().replace(/:\d+$/, '')
  const root = rootDomain.toLowerCase()
  if (host === root || !host.endsWith(`.${root}`)) return null
  const sub = host.slice(0, -(root.length + 1))
  if (!sub || sub.includes('.') || RESERVED_SUBDOMAINS.has(sub)) return null
  return sub
}

const RESERVED_SUBDOMAINS = new Set(['www', 'app', 'api', 'admin', 'painel', 'mail', 'static', 'cdn', 'status', 'blog', 'ajuda'])

// Link público que o lojista compartilha: domínio próprio > subdomínio
// da plataforma > /loja/slug.
export function publicStoreUrl(params: { slug: string; customDomain?: string | null; rootDomain?: string | null; baseUrl: string }): string {
  if (params.customDomain) return `https://${params.customDomain}`
  if (params.rootDomain && !params.rootDomain.includes('localhost') && !params.rootDomain.endsWith('vercel.app')) {
    return `https://${params.slug}.${params.rootDomain}`
  }
  return `${params.baseUrl}/loja/${params.slug}`
}
