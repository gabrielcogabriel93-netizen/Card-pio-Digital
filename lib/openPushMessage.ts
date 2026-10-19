import { formatBRL } from '@/lib/money'

// Texto do aviso "a loja abriu" (migration 051). Função pura: usada pelo
// servidor no envio e pelo painel na prévia. O modo automático só usa o
// que o lojista cadastrou (nome, preço, foto do produto) com frases
// fixas: nunca inventa promoção, desconto ou brinde.

export interface OpenPushStore {
  name: string
  open_push_mode?: 'auto' | 'custom' | null
  open_push_title?: string | null
  open_push_body?: string | null
}

export interface OpenPushProduct {
  id: string
  name: string
  price: number
  image_url?: string | null
}

export interface OpenPushMessage {
  title: string
  body: string
  productId: string | null
  image: string | null
}

const TITLES = ['{loja} está aberta! 🔥', 'Abrimos! 😋', 'A {loja} já está atendendo', 'Bateu a fome? A {loja} abriu']
const BODIES = [
  'Hoje tem {produto} por {preco}. Toque e peça em 1 minuto.',
  '{produto} por {preco}. Peça pelo app da {loja}.',
  'Que tal {produto} hoje? Sai por {preco}. Toque para pedir.',
]
const NO_PRODUCT = 'Toque para ver o cardápio e fazer seu pedido.'

function seedOf(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…')

/**
 * Monta o aviso. `products` são os produtos disponíveis (o servidor já
 * filtra ativos e não esgotados); `dayKey` varia o produto e a frase de
 * um dia para o outro.
 */
export function buildOpenPushMessage(
  store: OpenPushStore,
  products: OpenPushProduct[],
  dayKey: string,
  customProductId?: string | null
): OpenPushMessage {
  const fill = (tpl: string, p?: OpenPushProduct) =>
    tpl.replace(/\{loja\}/g, store.name).replace(/\{produto\}/g, p?.name || '').replace(/\{preco\}/g, p ? formatBRL(Number(p.price)) : '')

  if (store.open_push_mode === 'custom' && store.open_push_title?.trim() && store.open_push_body?.trim()) {
    const product = customProductId ? products.find((p) => p.id === customProductId) : undefined
    return {
      title: clip(store.open_push_title.trim(), 60),
      body: clip(store.open_push_body.trim(), 180),
      productId: product?.id || null,
      image: product?.image_url || null,
    }
  }

  const seed = seedOf(dayKey + store.name)
  // Prefere produto com foto; gira um por dia.
  const pool = products.some((p) => p.image_url) ? products.filter((p) => p.image_url) : products
  const product = pool.length ? [...pool].sort((a, b) => a.id.localeCompare(b.id))[seed % pool.length] : undefined
  return {
    title: clip(fill(TITLES[seed % TITLES.length]), 60),
    body: clip(product ? fill(BODIES[(seed >>> 3) % BODIES.length], product) : NO_PRODUCT, 180),
    productId: product?.id || null,
    image: product?.image_url || null,
  }
}
