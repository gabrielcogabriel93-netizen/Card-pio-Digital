// ============================================================
// Tipos TypeScript para o CatalogAI
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

// Automação do Kanban de pedidos (migration 029). 'manual' (padrão) é o
// comportamento de sempre — o lojista muda o status na mão. 'automatic'
// faz o pedido avançar sozinho, nos tempos configurados abaixo.
export type OrderAutomationMode = 'manual' | 'automatic'

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
  // Usada no preview de link (Open Graph/Twitter Card) quando o cliente
  // compartilha o cardápio — ver migration 030 e generateMetadata em
  // app/loja/[slug]/page.tsx.
  description?: string | null
  // Link do Instagram da loja, exibido no drawer "Sobre a loja" do
  // cardápio público — sempre normalizado como URL completa antes de
  // salvar (ver lib/instagram.ts). Migration 036.
  instagram_url?: string | null
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
  // Impressão automática de comanda (migration 027). NULL = lojista ainda
  // não decidiu (dispara o banner de primeira vez em Painel > Pedidos).
  // `printer_label` é só um apelido/lembrete em texto — a impressora usada
  // de verdade é sempre a padrão do Windows daquele computador.
  auto_print_enabled?: boolean | null
  printer_label?: string | null
  // Automação do Kanban por tempo (migration 029) — ver OrderAutomationMode.
  order_automation_mode?: OrderAutomationMode
  auto_confirm_minutes?: number
  auto_preparing_minutes?: number
  auto_completed_minutes_pickup?: number
  auto_completed_minutes_delivery?: number
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

// Sistema de combos (migration 040) -- kits de produtos com preço
// fixo, para qualquer tipo de negócio. Cada combo_group é um slot de
// escolha com nome livre; v1 sempre exige exatamente 1 produto por
// slot (min_select=max_select=1) -- colunas já preparadas pra
// multi-escolha futura. is_pizza_slot/fixed_pizza_size_id são uso
// opcional, só pra quem vende pizza reaproveitar os produtos-sabor
// existentes sem duplicar cadastro; o cliente só escolhe o sabor, o
// tamanho fica fixo (definido pelo lojista), diferente do pedido
// avulso de pizza.
export interface Combo {
  id: string
  establishment_id: string
  name: string
  description?: string | null
  image_url?: string | null
  price: number
  is_active: boolean
  display_order: number
  created_at?: string
}

// `combos` não tem nenhuma coluna sensível pra esconder do cardápio
// público -- a política de SELECT já libera leitura pública direto na
// tabela, igual pizza_sizes/pizza_flavors. Alias só pra deixar
// explícito, no código do cardápio, que o dado já veio filtrado por
// is_active = true.
export type PublicCombo = Combo

export interface ComboGroup {
  id: string
  combo_id: string
  name: string
  display_order: number
  is_pizza_slot: boolean
  fixed_pizza_size_id?: string | null
  min_select: number
  max_select: number
  created_at?: string
}

export interface ComboGroupProduct {
  id: string
  combo_group_id: string
  product_id: string
  display_order: number
  created_at?: string
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
  // Preenchido só quando o item é um combo (migration 040). Nesse
  // caso `product_id` acima é o id do COMBO (não existe em
  // `products`) -- usado só pra chave/exibição. `combo_selections`
  // guarda o produto escolhido em cada slot, pra baixa de estoque (ver
  // adjustStockForItems em app/painel/pedidos/page.tsx e o loop
  // equivalente em app/painel/balcao/page.tsx). `variations` continua
  // sendo a fonte de exibição genérica (WhatsApp/Kanban/recibo) --
  // não duplicar lógica de render a partir deste campo.
  combo_id?: string | null
  combo_selections?: {
    group_id: string
    group_name: string
    product_id: string
    product_name: string
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

// Mesa física do estabelecimento (migration 039). label é o que o
// garçom vê e o que fica no QR ("Mesa 5", "Varanda 2" etc.) — livre,
// não precisa ser numérico.
export interface RestaurantTable {
  id: string
  establishment_id: string
  label: string
  is_active: boolean
  display_order: number
  created_at: string
}

// Comanda aberta por mesa (migration 039) — acumula vários pedidos
// (orders.table_tab_id) enquanto o cliente está sentado. closed_total
// só é preenchido no fechamento (RPC close_table_tab); enquanto
// 'open', o total corrente é calculado no client somando os orders
// vinculados.
export interface TableTab {
  id: string
  establishment_id: string
  table_id: string
  status: 'open' | 'closed'
  opened_at: string
  closed_at?: string | null
  closed_total?: number | null
  created_at: string
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
  // Saldo de pontos de fidelidade (migration 038). 0 pra quem nunca
  // ganhou pontos, não confundir com "programa desativado" — essa
  // checagem é feita por LoyaltySettings.is_active à parte.
  loyalty_points_balance: number
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
  // Resgate de pontos de fidelidade (migration 038) — mutuamente
  // exclusivo com coupon_code (CHECK no banco). loyalty_points_redeemed
  // é o custo em pontos já debitado, não um valor em dinheiro.
  loyalty_reward_id?: string | null
  loyalty_points_redeemed?: number
  total: number
  status: OrderStatus
  source: 'online' | 'balcao' | 'mesa'
  order_type: 'delivery' | 'pickup' | 'mesa'
  // Só preenchido em pedidos source='mesa' (migration 039) — vincula à
  // comanda aberta da mesa. Vários orders podem compartilhar o mesmo
  // table_tab_id ao longo da refeição.
  table_tab_id?: string | null
  delivery_address?: DeliveryAddress | null
  payment_method?: string
  // Só usado em pedidos pagos via Mercado Pago (payment_method =
  // 'mercadopago_pix') — pagamento manual (dinheiro, Pix copia-e-cola,
  // cartão na entrega) nunca preenche isso, fica null. Independente do
  // `status` do Kanban, que o lojista controla manualmente.
  payment_status?: 'pending' | 'approved' | 'rejected' | 'cancelled' | null
  mercadopago_payment_id?: string | null
  // Preenchido pelo estabelecimento ao cancelar (obrigatório na tela) —
  // exibido pro cliente na página de acompanhamento.
  cancellation_reason?: string | null
  notes?: string
  created_at: string
  updated_at: string
  // Desde quando o pedido está no `status` atual — setado sozinho por
  // trigger (migration 029), usado pela automação por tempo pra saber
  // se já passou do prazo configurado pra avançar de etapa.
  status_changed_at?: string
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

// Programa de fidelidade (pontos) — migrations 037/038.
export type LoyaltyBenefitType = 'percent_discount' | 'fixed_discount' | 'free_shipping'

// Config de fidelidade da loja, gerenciada em /painel/fidelidade.
export interface LoyaltySettings {
  establishment_id: string
  is_active: boolean
  points_per_currency: number
  min_order_value_for_points?: number | null
  created_at?: string
  updated_at?: string
}

// Versão pública de LoyaltySettings (view `public_loyalty_settings`) —
// só o que o cardápio precisa pra decidir se mostra a seção de pontos.
export type PublicLoyaltySettings = Pick<
  LoyaltySettings,
  'establishment_id' | 'is_active' | 'points_per_currency' | 'min_order_value_for_points'
>

export interface LoyaltyReward {
  id: string
  establishment_id: string
  name: string
  description?: string | null
  points_cost: number
  benefit_type: LoyaltyBenefitType
  benefit_value?: number | null
  is_active: boolean
  created_at?: string
  updated_at?: string
}

// Versão pública de LoyaltyReward (view `public_loyalty_rewards`) — só
// recompensas ativas, sem is_active/timestamps internos.
export type PublicLoyaltyReward = Omit<LoyaltyReward, 'is_active' | 'created_at' | 'updated_at'>

// Ledger de crédito/débito de pontos — só leitura pelo lojista (CRM/
// auditoria futura); nunca escrito pelo client, só pelos triggers da
// migration 038.
export interface LoyaltyTransaction {
  id: string
  establishment_id: string
  customer_id: string
  order_id?: string | null
  reward_id?: string | null
  type: 'earn' | 'redeem' | 'revoke_earn' | 'revoke_redeem'
  points: number
  description?: string | null
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
  // Preenchido só quando `product` é o "produto sintético" que
  // representa um combo no carrinho (ver addComboItemToCart em
  // PublicMenuClient.tsx e balcao/page.tsx) -- carrega o id real do
  // combo e a escolha de cada slot, pra popular
  // OrderItem.combo_id/combo_selections ao montar o pedido.
  combo?: {
    combo_id: string
    selections: {
      group_id: string
      group_name: string
      product_id: string
      product_name: string
    }[]
  }
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
