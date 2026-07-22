// ============================================================
// Tipos TypeScript para o Cardápio SaaS
// ============================================================

// Estabelecimento (Tenant)
export interface Establishment {
  id: string
  owner_id: string
  name: string
  slug: string
  whatsapp_number: string
  logo_url?: string
  theme_color?: string
  address?: string
  opening_hours?: Record<string, { open: string; close: string }>
  is_open?: boolean
  delivery_fee?: number
  plan?: string
  created_at?: string
}

// Estabelecimento como visto pelo cardápio público — vem da view
// `public_establishments`, que nunca expõe owner_id/plan (ver migration 005).
export type PublicEstablishment = Omit<Establishment, 'owner_id' | 'plan' | 'created_at'>

// Categoria
export interface Category {
  id: string
  establishment_id: string
  name: string
  display_order: number
  created_at?: string
}

// Produto
export interface Product {
  id: string
  establishment_id: string
  category_id?: string
  name: string
  description?: string
  price: number
  image_url?: string
  stock_qty: number
  track_stock: boolean
  is_active: boolean
  display_order: number
  created_at?: string
  // Relações
  category?: Category
  variation_groups?: VariationGroup[]
}

// Produto como visto pelo cardápio público — vem da view `public_products`,
// que nunca expõe stock_qty/track_stock exatos (só se está disponível ou
// não). Ver migration 005.
export interface PublicProduct {
  id: string
  establishment_id: string
  category_id?: string
  name: string
  description?: string
  price: number
  image_url?: string
  display_order: number
  in_stock: boolean
}

// Grupo de Variação
export interface VariationGroup {
  id: string
  product_id: string
  name: string
  is_required: boolean
  allow_multiple: boolean
  display_order: number
  options?: VariationOption[]
}

// Opção de Variação
export interface VariationOption {
  id: string
  variation_group_id: string
  name: string
  price_delta: number
  display_order: number
}

// Item do Pedido (armazenado em JSONB)
export interface OrderItem {
  product_id: string
  product_name: string
  quantity: number
  unit_price: number
  total_price: number
  image_url?: string
  variations?: {
    group_name: string
    option_name: string
    price_delta: number
  }[]
}

// Pedido
export interface Order {
  id: string
  establishment_id: string
  customer_name: string
  customer_phone: string
  items: OrderItem[]
  subtotal: number
  shipping_fee: number
  total: number
  status: OrderStatus
  source: 'online' | 'balcao'
  payment_method?: string
  notes?: string
  created_at: string
  updated_at: string
}

export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'completed' | 'cancelled'

// Entrada Financeira
export interface FinancialEntry {
  id: string
  establishment_id: string
  order_id?: string
  type: 'income' | 'expense'
  amount: number
  description?: string
  created_at: string
}

// Carrinho (para o cardápio público e balcão). Genérico porque o cardápio
// público usa PublicProduct (sem estoque exato) e o balcão usa Product.
export interface CartItem<P = Product> {
  product: P
  quantity: number
  variations: {
    group_name: string
    option_name: string
    price_delta: number
  }[]
  unit_price: number
  total_price: number
}

// Dashboard Stats
export interface DashboardStats {
  pending_orders: number
  today_revenue: number
  average_ticket: number
  low_stock_products: number
}

// Filtros para o financeiro
export type FinancePeriod = 'today' | 'week' | 'month' | 'custom'
