// Service worker do Freguês.
// Estratégia: cache-first apenas para assets estáticos versionados pelo Next
// (JS/CSS/ícones); tudo mais (páginas, dados do Supabase) vai sempre para a
// rede, já que cardápio, pedidos e painel mudam a todo momento e não podem
// ficar desatualizados por causa de cache. Navegação sem rede cai numa
// página offline pré-cacheada: HTML estático puro (public/offline.html),
// sem JS do Next, para nunca apontar para arquivos de um deploy antigo.

const CACHE_NAME = 'fregues-v6'
const STATIC_ASSET_PATTERN = /\/_next\/static\/|\/icons\//
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  // Pré-cacheia a página offline na instalação — precisa estar disponível
  // ANTES de faltar rede, senão não tem como servi-la offline.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL))
  )
  // Sem self.skipWaiting() aqui de propósito: o novo service worker fica
  // "esperando" até o client mandar SKIP_WAITING (ver listener de message
  // abaixo) — é o que dá tempo da UI avisar "nova versão disponível" antes
  // de trocar o SW debaixo do usuário no meio de uma ação.
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  )
  self.clients.claim()
})

// PwaRegister.tsx manda essa mensagem quando o usuário clica em "Atualizar"
// no aviso de nova versão — só aí o SW novo assume de verdade.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
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
    return
  }

  // Navegação (troca de página): sempre tenta a rede primeiro (conteúdo
  // sempre fresco); só cai pro fallback offline se a rede falhar de
  // verdade (sem internet/sem sinal) — nunca serve HTML de cache normal.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL))
    )
  }
})

// Notificações: novo pedido para o lojista (app/api/push/send), status do
// pedido e mensagens da loja para o cliente (lib/customerPush.ts). Chegam
// mesmo com o app fechado.
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
      // Notificação do cliente leva o logo da loja (lib/orderPush.ts).
      icon: data.icon || '/icons/icon-192x192.png?v=2',
      badge: '/icons/badge-96x96.png?v=2',
      // Foto do produto em destaque (Android e computador mostram grande).
      image: data.image || undefined,
      tag: data.tag || data.url,
      renotify: true,
      data: { url: data.url || '/painel/pedidos', campaignId: data.campaignId || null },
    })
  )
})

// Clique na notificação: foca uma aba já aberta no painel de pedidos, ou
// abre uma nova se não tiver nenhuma.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/painel/pedidos'
  const campaignId = event.notification.data?.campaignId

  // Clique em mensagem da loja conta no painel (Notificações → histórico).
  const track = campaignId
    ? fetch('/api/push/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaignId }),
      }).catch(() => {})
    : Promise.resolve()

  event.waitUntil(
    Promise.all([
      track,
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(targetUrl) && 'focus' in client) return client.focus()
        }
        if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
      }),
    ])
  )
})
