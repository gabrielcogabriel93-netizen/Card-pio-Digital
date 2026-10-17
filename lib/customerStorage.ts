// Persistência leve no navegador do cliente final (localStorage), sem
// exigir cadastro/login. Objetivo: quem já pediu antes não perde o
// carrinho ao atualizar a página, não precisa redigitar nome/telefone
// toda vez, e não perde o link do último pedido se fechar a aba. Tudo
// serve só como conveniência — nunca é a fonte de verdade (isso é
// sempre o banco).

const CUSTOMER_KEY = 'cardapio:customer'
const ADDRESS_KEY = 'cardapio:address'
const cartKey = (establishmentId: string) => `cardapio:cart:${establishmentId}`
const lastOrderKey = (establishmentId: string) => `cardapio:last_order:${establishmentId}`

function safeGet<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function safeSet(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage indisponível (modo privado, quota cheia etc.) — a
    // experiência continua funcionando, só sem a conveniência.
  }
}

function safeRemove(key: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {}
}

export interface SavedCustomer {
  name: string
  phone: string
}

// Nome/telefone: mesma pessoa tende a pedir em lojas diferentes, então
// fica salvo globalmente (não por estabelecimento).
export function getSavedCustomer(): SavedCustomer | null {
  return safeGet<SavedCustomer>(CUSTOMER_KEY)
}

export function saveCustomer(customer: SavedCustomer) {
  safeSet(CUSTOMER_KEY, customer)
}

export interface SavedAddress {
  street: string
  number: string
  neighborhood: string
  complement?: string
  reference?: string
  zip_code?: string
}

// Endereço de entrega: mesma lógica do nome/telefone — a pessoa costuma
// morar no mesmo lugar ao pedir de lojas diferentes.
export function getSavedAddress(): SavedAddress | null {
  return safeGet<SavedAddress>(ADDRESS_KEY)
}

export function saveAddress(address: SavedAddress) {
  safeSet(ADDRESS_KEY, address)
}

// Carrinho: por estabelecimento, para não misturar itens de lojas diferentes.
export function getSavedCart<T>(establishmentId: string): T | null {
  return safeGet<T>(cartKey(establishmentId))
}

export function saveCart(establishmentId: string, cart: unknown[]) {
  if (cart.length === 0) {
    safeRemove(cartKey(establishmentId))
    return
  }
  safeSet(cartKey(establishmentId), cart)
}

export function clearSavedCart(establishmentId: string) {
  safeRemove(cartKey(establishmentId))
}

export interface SavedLastOrder {
  orderId: string
  createdAt: number
}

// Último pedido: sobrevive a fechar/reabrir a aba, então o banner
// "Acompanhar pedido" continua aparecendo mesmo depois de recarregar.
// Expira sozinho depois de 48h para não mostrar pedidos muito antigos.
const LAST_ORDER_TTL_MS = 48 * 60 * 60 * 1000

export function saveLastOrder(establishmentId: string, orderId: string) {
  safeSet(lastOrderKey(establishmentId), { orderId, createdAt: Date.now() } as SavedLastOrder)
}

export function getSavedLastOrder(establishmentId: string): string | null {
  const saved = safeGet<SavedLastOrder>(lastOrderKey(establishmentId))
  if (!saved) return null
  if (Date.now() - saved.createdAt > LAST_ORDER_TTL_MS) {
    safeRemove(lastOrderKey(establishmentId))
    return null
  }
  return saved.orderId
}

export function clearSavedLastOrder(establishmentId: string) {
  safeRemove(lastOrderKey(establishmentId))
}

// Token do aparelho (migration 045): prova de que este navegador já fez
// pedido (ou confirmou o código) com aquele telefone naquela loja. Sem
// ele, o banco não devolve endereço, pontos nem histórico.
const tokenKey = (establishmentId: string) => `cardapio:token:${establishmentId}`

interface SavedToken {
  phone: string
  token: string
}

const digits = (phone: string) => phone.replace(/D/g, '')

export function saveCustomerToken(establishmentId: string, phone: string, token: string) {
  const all = safeGet<SavedToken[]>(tokenKey(establishmentId)) || []
  const next = [{ phone: digits(phone), token }, ...all.filter((t) => t.phone !== digits(phone))].slice(0, 5)
  safeSet(tokenKey(establishmentId), next)
}

export function getCustomerToken(establishmentId: string, phone: string): string | null {
  const all = safeGet<SavedToken[]>(tokenKey(establishmentId)) || []
  return all.find((t) => t.phone === digits(phone))?.token || null
}

export function clearCustomerToken(establishmentId: string, phone: string) {
  const all = safeGet<SavedToken[]>(tokenKey(establishmentId)) || []
  safeSet(tokenKey(establishmentId), all.filter((t) => t.phone !== digits(phone)))
}

// "Pedir de novo": a página Meus Pedidos guarda os itens aqui e o
// cardápio os recoloca no carrinho ao abrir.
const reorderKey = (establishmentId: string) => `cardapio:reorder:${establishmentId}`

export function saveReorder(establishmentId: string, items: unknown[]) {
  safeSet(reorderKey(establishmentId), items)
}

export function takeReorder<T>(establishmentId: string): T[] | null {
  const items = safeGet<T[]>(reorderKey(establishmentId))
  safeRemove(reorderKey(establishmentId))
  return items
}
