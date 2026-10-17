import { describe, it, expect } from 'vitest'
import { normalizeDomainInput, isValidDomain, dnsRecordFor, storeSlugFromSubdomain, publicStoreUrl } from './domains'

describe('normalizeDomainInput', () => {
  it('strips protocol, www, path and port', () => {
    expect(normalizeDomainInput(' https://www.Bella.com.br/cardapio?x=1 ')).toBe('bella.com.br')
    expect(normalizeDomainInput('cardapio.bella.com.br:443')).toBe('cardapio.bella.com.br')
  })
})

describe('isValidDomain', () => {
  it('accepts real domains and rejects junk', () => {
    expect(isValidDomain('bella.com.br')).toBe(true)
    expect(isValidDomain('cardapio.bella.com.br')).toBe(true)
    expect(isValidDomain('bella')).toBe(false)
    expect(isValidDomain('-bella.com')).toBe(false)
    expect(isValidDomain('bel la.com')).toBe(false)
  })
})

describe('dnsRecordFor', () => {
  it('uses CNAME for subdomains, including .com.br', () => {
    expect(dnsRecordFor('cardapio.bella.com.br')).toEqual({ type: 'CNAME', name: 'cardapio', value: 'cname.vercel-dns.com' })
    expect(dnsRecordFor('pedidos.bella.com')).toEqual({ type: 'CNAME', name: 'pedidos', value: 'cname.vercel-dns.com' })
  })

  it('uses an A record for apex domains', () => {
    expect(dnsRecordFor('bella.com.br').type).toBe('A')
    expect(dnsRecordFor('bella.com').type).toBe('A')
  })
})

describe('storeSlugFromSubdomain', () => {
  it('extracts the store slug from a platform subdomain', () => {
    expect(storeSlugFromSubdomain('bellamassa.fregues.app', 'fregues.app')).toBe('bellamassa')
    expect(storeSlugFromSubdomain('BellaMassa.fregues.app:3000', 'fregues.app')).toBe('bellamassa')
  })

  it('ignores the root, reserved names, nested subdomains and other hosts', () => {
    expect(storeSlugFromSubdomain('fregues.app', 'fregues.app')).toBeNull()
    expect(storeSlugFromSubdomain('www.fregues.app', 'fregues.app')).toBeNull()
    expect(storeSlugFromSubdomain('a.b.fregues.app', 'fregues.app')).toBeNull()
    expect(storeSlugFromSubdomain('bella.com.br', 'fregues.app')).toBeNull()
    expect(storeSlugFromSubdomain('bella.fregues.app', undefined)).toBeNull()
  })
})

describe('publicStoreUrl', () => {
  const base = { slug: 'bella', baseUrl: 'https://app.fregues.app' }
  it('prefers the custom domain, then the subdomain, then /loja/slug', () => {
    expect(publicStoreUrl({ ...base, customDomain: 'bella.com.br', rootDomain: 'fregues.app' })).toBe('https://bella.com.br')
    expect(publicStoreUrl({ ...base, rootDomain: 'fregues.app' })).toBe('https://bella.fregues.app')
    expect(publicStoreUrl({ ...base, rootDomain: 'meuapp.vercel.app' })).toBe('https://app.fregues.app/loja/bella')
    expect(publicStoreUrl(base)).toBe('https://app.fregues.app/loja/bella')
  })
})
