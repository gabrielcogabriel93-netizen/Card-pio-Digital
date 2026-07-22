// Service worker do Cardápio SaaS.
// Estratégia: cache-first apenas para assets estáticos versionados pelo Next
// (JS/CSS/ícones); tudo mais (páginas, dados do Supabase) vai sempre para a
// rede, já que cardápio, pedidos e painel mudam a todo momento e não podem
// ficar desatualizados por causa de cache.

const CACHE_NAME = 'cardapio-saas-v1'
const STATIC_ASSET_PATTERN = /\/_next\/static\/|\/icons\//

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (STATIC_ASSET_PATTERN.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request)
        if (cached) return cached

        const response = await fetch(request)
        if (response.ok) cache.put(request, response.clone())
        return response
      })
    )
  }
})
