// ============================================================
// Tipos TypeScript para o Cardápio SaaS
// ============================================================

// Tipo de negócio, definido no quiz de onboarding (ou depois em
// Configurações): controla se o painel mostra o acompanhamento completo
// de pedido (Kanban com "em preparo") ou um fluxo simplificado
// (recebido -> concluído), pensado para quem vende produto pronto.
export type BusinessType = 'preparo' | 'pronto' | 'hibrido'

// Como o estabelecimento paga a plataforma: comissão por pedido pago
// automaticamente (Mercado Pago) ou mensalidade fixa. "mensalidade" ainda
// não tem cobrança recorrente implementada — fica "em breve" na UI.
export type BillingMode = 'comissao' | 'mensalidade'

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
  offers_delivery?: boolean
  offers_pickup?: boolean
  use_neighborhood_delivery_fee?: boolean
  birthday_discount_percent?: number | null
  free_shipping_threshold?: number | null
  pix_key?: string | null
  pix_key_type?: string | null
  pix_city?: string | null
  business_type?: BusinessType
  custom_domain?: string | null
  order_tracking_enabled?: boolean
  onboarding_completed?: boolean
  whatsapp_notifications_enabled?: boolean
  billing_mode?: BillingMode
  // Só true quando há uma conta Mercado Pago conectada e ativa E
  // billing_mode = 'comissao' — nunca inclui token nenhum, é o único sinal
  // que a view pública (`public_establishments`) expõe (migration 026).
  mercadopago_pix_enabled?: boolean
  plan?: string
  created_at?: string
}

// Estabelecimento como visto pelo cardápio público — vem da view
// `public_establishments`, que nunca expõe owner_id/plan (ver migration 005).
export type PublicEstablishment = Omit<
  Establishment,
  'owner_id' | 'plan' | 'created_at' | 'onboarding_completed'
>

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
  is_featured?: boolean
  display_order: number
  created_at?: string
  // Produto de pizza: aponta pro sabor que ele representa no catálogo.
  // Quando preenchido, o cadastro de variações genérico (variation_groups)
  // não se aplica — tamanhos/sabores/adicionais vêm do sistema de pizza.
  pizza_flavor_id?: string | null
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
  is_featured?: boolean
  is_bestseller?: boolean
  in_stock: boolean
  pizza_flavor_id?: string | null
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

// ============================================================
// SISTEMA DE PIZZA — sabores, tamanhos, meio a meio e adicionais.
// Ver migration 025. `base_price` do tamanho é o preço do sabor
// "principal" (o primeiro cadastrado); os demais sabores só guardam um
// acréscimo (`price_delta`) sobre esse valor, por tamanho.
// ============================================================

export type PizzaFlavorCategory = 'salgada' | 'doce'

// Tamanho de pizza
export interface PizzaSize {
  id: string
  establishment_id: string
  name: string
  base_price: number
  // Quantos sabores esse tamanho aceita dividir: 1 = não divide, 2 = meio
  // a meio, 3 = três sabores...
  max_flavors: number
  display_order: number
  is_active: boolean
  created_at?: string
}

// Sabor de pizza
export interface PizzaFlavor {
  id: string
  establishment_id: string
  name: string
  description?: string | null
  image_url?: string | null
  category?: PizzaFlavorCategory | null
  is_active: boolean
  display_order: number
  created_at?: string
}

// Acréscimo de um sabor sobre o base_price de um tamanho
export interface PizzaFlavorPrice {
  id: string
  flavor_id: string
  size_id: string
  price_delta: number
}

// Adicional de pizza (ex: borda recheada)
export interface PizzaAdditional {
  id: string
  establishment_id: string
  name: string
  is_active: boolean
  display_order: number
  created_at?: string
}

// Preço de um adicional para um tamanho específico
export interface PizzaAdditionalPrice {
  id: string
  additional_id: string
  size_id: string
  price: number
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

// Endereço de entrega estruturado (preenchido só quando order_type = 'delivery')
export interface DeliveryAddress {
  street: string
  number: string
  neighborhood: string
  complement?: string
  reference?: string
  zip_code?: string
  // Preenchido só quando o bairro veio da lista de delivery_neighborhoods
  // (taxa de entrega por bairro) — ajuda a auditar depois, não é usado
  // pra recalcular nada (o valor já foi travado em shipping_fee).
  neighborhood_id?: string | null
}

// Bairro cadastrado pelo lojista com valor de frete próprio.
export interface DeliveryNeighborhood {
  id: string
  establishment_id: string
  name: string
  fee: number
  is_active: boolean
  display_order: number
  created_at?: string
}

// Como o cardápio público vê os bairros — vem da view
// `public_delivery_neighborhoods`, só bairros ativos.
export interface PublicDeliveryNeighborhood {
  id: string
  establishment_id: string
  name: string
  fee: number
}

// Endereço salvo no perfil do cliente (rótulo tipo "Casa", "Trabalho").
export interface CustomerAddress {
  id: string
  label: string
  street: string
  number: string
  neighborhood: string
  complement?: string | null
  reference?: string | null
  zip_code?: string | null
}

// Perfil do cliente — vem da função `get_customer_profile`, identificado
// só pelo telefone (sem conta/senha), com todos os endereços salvos.
export interface CustomerProfile {
  customer_id: string
  name: string
  birth_date?: string | null
  addresses: CustomerAddress[]
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
  discount?: number
  coupon_code?: string
  total: number
  status: OrderStatus
  source: 'online' | 'balcao'
  order_type: 'delivery' | 'pickup'
  delivery_address?: DeliveryAddress | null
  payment_method?: string
  // Só usado em pedidos pagos via Mercado Pago (payment_method =
  // 'mercadopago_pix') — pagamento manual (dinheiro, Pix copia-e-cola,
  // cartão na entrega) nunca preenche isso, fica null. Independente do
  // `status` do Kanban, que o lojista controla manualmente.
  payment_status?: 'pending' | 'approved' | 'rejected' | 'cancelled' | null
  mercadopago_payment_id?: string | null
  notes?: string
  created_at: string
  updated_at: string
}

// Cupom de desconto
export interface Coupon {
  id: string
  establishment_id: string
  code: string
  discount_type: 'percent' | 'fixed' | 'free_shipping'
  discount_value: number
  is_active: boolean
  expires_at?: string
  max_uses?: number
  max_uses_per_customer?: number | null
  used_count: number
  created_at?: string
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
  delivery_orders_today: number
  pickup_orders_today: number
  balcao_orders_today: number
}

// Filtros para o financeiro
export type FinancePeriod = 'today' | 'week' | 'month' | 'custom'
