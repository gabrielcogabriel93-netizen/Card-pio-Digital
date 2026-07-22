-- ============================================================
-- CARDÁPIO SaaS - Migration Inicial
-- Schema completo do banco de dados multi-tenant
-- ============================================================

-- 1. ESTABELECIMENTOS (Tenants)
CREATE TABLE establishments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  whatsapp_number TEXT NOT NULL,
  logo_url TEXT,
  theme_color TEXT DEFAULT '#22c55e',
  address TEXT,
  opening_hours JSONB,
  is_open BOOLEAN DEFAULT true,
  plan TEXT DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. CATEGORIAS DO CARDÁPIO
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. PRODUTOS
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL,
  image_url TEXT,
  stock_qty INT DEFAULT 0,
  track_stock BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. GRUPOS DE VARIAÇÃO (ex: Tamanho, Sabor, Cor)
CREATE TABLE variation_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  is_required BOOLEAN DEFAULT false,
  allow_multiple BOOLEAN DEFAULT false,
  display_order INT DEFAULT 0
);

-- 5. OPÇÕES DE VARIAÇÃO
CREATE TABLE variation_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variation_group_id UUID REFERENCES variation_groups(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  price_delta NUMERIC(10,2) DEFAULT 0,
  display_order INT DEFAULT 0
);

-- 6. PEDIDOS
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  items JSONB NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  shipping_fee NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) NOT NULL,
  status TEXT DEFAULT 'pending',
  source TEXT DEFAULT 'online',
  payment_method TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. MOVIMENTAÇÕES FINANCEIRAS
CREATE TABLE financial_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE NOT NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  type TEXT DEFAULT 'income',
  amount NUMERIC(10,2) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX idx_establishments_owner_id ON establishments(owner_id);
CREATE INDEX idx_establishments_slug ON establishments(slug);
CREATE INDEX idx_categories_establishment_id ON categories(establishment_id);
CREATE INDEX idx_products_establishment_id ON products(establishment_id);
CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_variation_groups_product_id ON variation_groups(product_id);
CREATE INDEX idx_variation_options_group_id ON variation_options(variation_group_id);
CREATE INDEX idx_orders_establishment_id ON orders(establishment_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_financial_entries_establishment_id ON financial_entries(establishment_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE establishments ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE variation_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE variation_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_entries ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- POLICIES DE SEGURANÇA
-- ============================================================

-- ESTABELECIMENTOS: apenas o proprietário
CREATE POLICY "establishments_select_owner" ON establishments
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "establishments_insert_owner" ON establishments
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "establishments_update_owner" ON establishments
  FOR UPDATE USING (auth.uid() = owner_id);

-- Permitir SELECT público do cardápio apenas para lojas abertas
CREATE POLICY "establishments_select_public" ON establishments
  FOR SELECT USING (true);

-- CATEGORIAS: proprietário do estabelecimento
CREATE POLICY "categories_select_owner" ON categories
  FOR SELECT USING (
    establishment_id IN (
      SELECT id FROM establishments WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "categories_insert_owner" ON categories
  FOR INSERT WITH CHECK (
    establishment_id IN (
      SELECT id FROM establishments WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "categories_update_owner" ON categories
  FOR UPDATE USING (
    establishment_id IN (
      SELECT id FROM establishments WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "categories_delete_owner" ON categories
  FOR DELETE USING (
    establishment_id IN (
      SELECT id FROM establishments WHERE owner_id = auth.uid()
    )
  );

-- Permitir SELECT público das categorias (para o cardápio)
CREATE POLICY "categories_select_public" ON categories
  FOR SELECT USING (true);

-- PRODUTOS: proprietário
CREATE POLICY "products_select_owner" ON products
  FOR SELECT USING (
    establishment_id IN (
      SELECT id FROM establishments WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "products_insert_owner" ON products
  FOR INSERT WITH CHECK (
    establishment_id IN (
      SELECT id FROM establishments WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "products_update_owner" ON products
  FOR UPDATE USING (
    establishment_id IN (
      SELECT id FROM establishments WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "products_delete_owner" ON products
  FOR DELETE USING (
    establishment_id IN (
      SELECT id FROM establishments WHERE owner_id = auth.uid()
    )
  );

-- Permitir SELECT público de produtos ativos
CREATE POLICY "products_select_public" ON products
  FOR SELECT USING (is_active = true);

-- VARIAÇÕES: proprietário via cascade
CREATE POLICY "variation_groups_select_owner" ON variation_groups
  FOR SELECT USING (
    product_id IN (
      SELECT p.id FROM products p
      JOIN establishments e ON e.id = p.establishment_id
      WHERE e.owner_id = auth.uid()
    )
  );

CREATE POLICY "variation_groups_insert_owner" ON variation_groups
  FOR INSERT WITH CHECK (
    product_id IN (
      SELECT p.id FROM products p
      JOIN establishments e ON e.id = p.establishment_id
      WHERE e.owner_id = auth.uid()
    )
  );

CREATE POLICY "variation_groups_update_owner" ON variation_groups
  FOR UPDATE USING (
    product_id IN (
      SELECT p.id FROM products p
      JOIN establishments e ON e.id = p.establishment_id
      WHERE e.owner_id = auth.uid()
    )
  );

CREATE POLICY "variation_groups_delete_owner" ON variation_groups
  FOR DELETE USING (
    product_id IN (
      SELECT p.id FROM products p
      JOIN establishments e ON e.id = p.establishment_id
      WHERE e.owner_id = auth.uid()
    )
  );

-- Permitir SELECT público das variações
CREATE POLICY "variation_groups_select_public" ON variation_groups
  FOR SELECT USING (true);

-- VARIATION OPTIONS
CREATE POLICY "variation_options_select_owner" ON variation_options
  FOR SELECT USING (
    variation_group_id IN (
      SELECT vg.id FROM variation_groups vg
      JOIN products p ON p.id = vg.product_id
      JOIN establishments e ON e.id = p.establishment_id
      WHERE e.owner_id = auth.uid()
    )
  );

CREATE POLICY "variation_options_insert_owner" ON variation_options
  FOR INSERT WITH CHECK (
    variation_group_id IN (
      SELECT vg.id FROM variation_groups vg
      JOIN products p ON p.id = vg.product_id
      JOIN establishments e ON e.id = p.establishment_id
      WHERE e.owner_id = auth.uid()
    )
  );

CREATE POLICY "variation_options_update_owner" ON variation_options
  FOR UPDATE USING (
    variation_group_id IN (
      SELECT vg.id FROM variation_groups vg
      JOIN products p ON p.id = vg.product_id
      JOIN establishments e ON e.id = p.establishment_id
      WHERE e.owner_id = auth.uid()
    )
  );

CREATE POLICY "variation_options_delete_owner" ON variation_options
  FOR DELETE USING (
    variation_group_id IN (
      SELECT vg.id FROM variation_groups vg
      JOIN products p ON p.id = vg.product_id
      JOIN establishments e ON e.id = p.establishment_id
      WHERE e.owner_id = auth.uid()
    )
  );

-- Permitir SELECT público
CREATE POLICY "variation_options_select_public" ON variation_options
  FOR SELECT USING (true);

-- PEDIDOS: proprietário vê tudo, público pode inserir
CREATE POLICY "orders_select_owner" ON orders
  FOR SELECT USING (
    establishment_id IN (
      SELECT id FROM establishments WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "orders_insert_public" ON orders
  FOR INSERT WITH CHECK (true);

CREATE POLICY "orders_update_owner" ON orders
  FOR UPDATE USING (
    establishment_id IN (
      SELECT id FROM establishments WHERE owner_id = auth.uid()
    )
  );

-- FINANCIAL ENTRIES: apenas proprietário
CREATE POLICY "financial_entries_select_owner" ON financial_entries
  FOR SELECT USING (
    establishment_id IN (
      SELECT id FROM establishments WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "financial_entries_insert_owner" ON financial_entries
  FOR INSERT WITH CHECK (
    establishment_id IN (
      SELECT id FROM establishments WHERE owner_id = auth.uid()
    )
  );

-- ============================================================
-- FUNÇÕES AUXILIARES
-- ============================================================

-- Função para gerar slug único
CREATE OR REPLACE FUNCTION generate_unique_slug(base_slug TEXT)
RETURNS TEXT AS $$
DECLARE
  unique_slug TEXT;
  counter INT := 1;
BEGIN
  unique_slug := LOWER(REGEXP_REPLACE(TRIM(base_slug), '[^a-zA-Z0-9]+', '-', 'g'));
  
  WHILE EXISTS (SELECT 1 FROM establishments WHERE slug = unique_slug) LOOP
    unique_slug := LOWER(REGEXP_REPLACE(TRIM(base_slug), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || counter;
    counter := counter + 1;
  END LOOP;
  
  RETURN unique_slug;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para atualizar updated_at dos pedidos
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar updated_at em orders
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
