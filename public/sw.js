// Service worker do CatalogAI.
// Estratégia: cache-first apenas para assets estáticos versionados pelo Next
// (JS/CSS/ícones); tudo mais (páginas, dados do Supabase) vai sempre para a
// rede, já que cardápio, pedidos e painel mudam a todo momento e não podem
// ficar desatualizados por causa de cache.

const CACHE_NAME = 'catalogai-v1'
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

// Notificações de novo pedido (ver app/api/push/send). Chega mesmo com
// o app fechado — é literalmente o motivo de existir um service worker
// pra isso, uma aba aberta não seria avisada de outro jeito.
self.addEventListener('push', (event) => {
  let data = { title: 'Novo pedido!', body: 'Você recebeu um novo pedido.', url: '/painel/pedidos' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    // payload não era JSON — usa o fallback acima
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      data: { url: data.url || '/painel/pedidos' },
    })
  )
})

// Clique na notificação: foca uma aba já aberta no painel de pedidos, ou
// abre uma nova se não tiver nenhuma.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/painel/pedidos'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    })
  )
})
