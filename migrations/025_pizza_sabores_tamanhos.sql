-- ============================================================
-- CARDÁPIO SaaS - Migration 025
-- Sistema de pizza: sabores, tamanhos (com "quantos sabores aceita"),
-- meio a meio (cobra o sabor mais caro) e adicionais com preço por
-- tamanho.
--
-- Modelo: cada tamanho tem um `base_price` (o preço do "sabor principal"
-- que o lojista cadastra primeiro no assistente). Os demais sabores só
-- guardam um ACRÉSCIMO (`price_delta`) sobre esse `base_price`, por
-- tamanho — não existe conceito de "sabor principal" persistido, é só o
-- primeiro sabor cadastrado, e depois disso é um sabor comum com
-- acréscimo 0 em todos os tamanhos.
--
-- Um produto normal (`products`) vira "produto de pizza" quando
-- `pizza_flavor_id` aponta pra um sabor. O preço mostrado na vitrine
-- (`products.price`) é sincronizado automaticamente por trigger sempre
-- que os tamanhos ou os acréscimos do sabor mudam, então a listagem
-- pública (`public_products`) não precisa de nenhuma lógica nova além de
-- expor essa coluna.
-- ============================================================

-- 1. TAMANHOS DE PIZZA
CREATE TABLE pizza_sizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  base_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_flavors INT NOT NULL DEFAULT 1 CHECK (max_flavors BETWEEN 1 AND 4),
  display_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. SABORES DE PIZZA
CREATE TABLE pizza_flavors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  category TEXT CHECK (category IN ('salgada', 'doce')),
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. ACRÉSCIMO DE CADA SABOR POR TAMANHO (sobre o base_price do tamanho)
CREATE TABLE pizza_flavor_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flavor_id UUID REFERENCES pizza_flavors(id) ON DELETE CASCADE NOT NULL,
  size_id UUID REFERENCES pizza_sizes(id) ON DELETE CASCADE NOT NULL,
  price_delta NUMERIC(10,2) NOT NULL DEFAULT 0,
  UNIQUE (flavor_id, size_id)
);

-- 4. ADICIONAIS DE PIZZA (ex: borda recheada)
CREATE TABLE pizza_additionals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. PREÇO DE CADA ADICIONAL POR TAMANHO (borda recheada custa diferente no P e no G)
CREATE TABLE pizza_additional_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  additional_id UUID REFERENCES pizza_additionals(id) ON DELETE CASCADE NOT NULL,
  size_id UUID REFERENCES pizza_sizes(id) ON DELETE CASCADE NOT NULL,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  UNIQUE (additional_id, size_id)
);

-- 6. LIGAÇÃO PRODUTO <-> SABOR
-- Cada sabor vira, no máximo, um produto do catálogo (é o "sabor Calabresa
-- como produto", com foto/descrição próprias). O índice único parcial
-- garante 1-pra-1.
ALTER TABLE products ADD COLUMN IF NOT EXISTS pizza_flavor_id UUID REFERENCES pizza_flavors(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_pizza_flavor_unique ON products (pizza_flavor_id) WHERE pizza_flavor_id IS NOT NULL;

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX idx_pizza_sizes_establishment_id ON pizza_sizes(establishment_id);
CREATE INDEX idx_pizza_flavors_establishment_id ON pizza_flavors(establishment_id);
CREATE INDEX idx_pizza_flavor_prices_flavor_id ON pizza_flavor_prices(flavor_id);
CREATE INDEX idx_pizza_flavor_prices_size_id ON pizza_flavor_prices(size_id);
CREATE INDEX idx_pizza_additionals_establishment_id ON pizza_additionals(establishment_id);
CREATE INDEX idx_pizza_additional_prices_additional_id ON pizza_additional_prices(additional_id);
CREATE INDEX idx_pizza_additional_prices_size_id ON pizza_additional_prices(size_id);

-- ============================================================
-- ROW LEVEL SECURITY — mesmo padrão de variation_groups/variation_options
-- (migration 001): SELECT público liberado (dado não sensível, precisa
-- estar visível no cardápio anônimo), CRUD restrito ao dono.
-- ============================================================
ALTER TABLE pizza_sizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pizza_flavors ENABLE ROW LEVEL SECURITY;
ALTER TABLE pizza_flavor_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE pizza_additionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE pizza_additional_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pizza_sizes_select_public" ON pizza_sizes FOR SELECT USING (true);
CREATE POLICY "pizza_sizes_owner_all" ON pizza_sizes FOR ALL USING (
  establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid())
) WITH CHECK (
  establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid())
);

CREATE POLICY "pizza_flavors_select_public" ON pizza_flavors FOR SELECT USING (true);
CREATE POLICY "pizza_flavors_owner_all" ON pizza_flavors FOR ALL USING (
  establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid())
) WITH CHECK (
  establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid())
);

CREATE POLICY "pizza_flavor_prices_select_public" ON pizza_flavor_prices FOR SELECT USING (true);
CREATE POLICY "pizza_flavor_prices_owner_all" ON pizza_flavor_prices FOR ALL USING (
  flavor_id IN (
    SELECT f.id FROM pizza_flavors f
    JOIN establishments e ON e.id = f.establishment_id
    WHERE e.owner_id = auth.uid()
  )
) WITH CHECK (
  flavor_id IN (
    SELECT f.id FROM pizza_flavors f
    JOIN establishments e ON e.id = f.establishment_id
    WHERE e.owner_id = auth.uid()
  )
);

CREATE POLICY "pizza_additionals_select_public" ON pizza_additionals FOR SELECT USING (true);
CREATE POLICY "pizza_additionals_owner_all" ON pizza_additionals FOR ALL USING (
  establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid())
) WITH CHECK (
  establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid())
);

CREATE POLICY "pizza_additional_prices_select_public" ON pizza_additional_prices FOR SELECT USING (true);
CREATE POLICY "pizza_additional_prices_owner_all" ON pizza_additional_prices FOR ALL USING (
  additional_id IN (
    SELECT a.id FROM pizza_additionals a
    JOIN establishments e ON e.id = a.establishment_id
    WHERE e.owner_id = auth.uid()
  )
) WITH CHECK (
  additional_id IN (
    SELECT a.id FROM pizza_additionals a
    JOIN establishments e ON e.id = a.establishment_id
    WHERE e.owner_id = auth.uid()
  )
);

-- ============================================================
-- SINCRONIZAÇÃO AUTOMÁTICA DO PREÇO NA VITRINE
-- products.price (usado pela listagem/card "a partir de R$") passa a
-- refletir sempre o menor preço entre os tamanhos ativos pra aquele
-- sabor: MIN(tamanho.base_price + acréscimo do sabor no tamanho).
-- Chamada por trigger sempre que tamanhos ou acréscimos mudam — assim a
-- vitrine nunca fica desatualizada sem precisar mexer no front.
-- ============================================================
CREATE OR REPLACE FUNCTION sync_pizza_product_prices(p_establishment_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE products p
  SET price = sub.min_price
  FROM (
    SELECT pf.id AS flavor_id, MIN(s.base_price + COALESCE(fp.price_delta, 0)) AS min_price
    FROM pizza_flavors pf
    JOIN pizza_sizes s ON s.establishment_id = pf.establishment_id AND s.is_active = true
    LEFT JOIN pizza_flavor_prices fp ON fp.size_id = s.id AND fp.flavor_id = pf.id
    WHERE pf.establishment_id = p_establishment_id
    GROUP BY pf.id
  ) sub
  WHERE p.pizza_flavor_id = sub.flavor_id;
END;
$$;

CREATE OR REPLACE FUNCTION trg_sync_pizza_prices_from_flavor_price()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_establishment_id UUID;
BEGIN
  SELECT establishment_id INTO v_establishment_id
  FROM pizza_flavors WHERE id = COALESCE(NEW.flavor_id, OLD.flavor_id);

  IF v_establishment_id IS NOT NULL THEN
    PERFORM sync_pizza_product_prices(v_establishment_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_pizza_flavor_prices_sync
AFTER INSERT OR UPDATE OR DELETE ON pizza_flavor_prices
FOR EACH ROW EXECUTE FUNCTION trg_sync_pizza_prices_from_flavor_price();

CREATE OR REPLACE FUNCTION trg_sync_pizza_prices_from_size()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_establishment_id UUID;
BEGIN
  v_establishment_id := COALESCE(NEW.establishment_id, OLD.establishment_id);
  IF v_establishment_id IS NOT NULL THEN
    PERFORM sync_pizza_product_prices(v_establishment_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_pizza_sizes_sync
AFTER INSERT OR UPDATE OR DELETE ON pizza_sizes
FOR EACH ROW EXECUTE FUNCTION trg_sync_pizza_prices_from_size();

-- ============================================================
-- VIEW PÚBLICA DE PRODUTOS: expõe qual sabor de pizza o produto
-- representa. É o único ponto de contato do cardápio público com o
-- sistema de pizza — o resto (tamanhos/sabores/adicionais) é lido direto
-- das tabelas novas (SELECT público liberado acima, igual
-- variation_groups/variation_options).
-- CREATE OR REPLACE VIEW só aceita adicionar coluna no final.
-- ============================================================
CREATE OR REPLACE VIEW public_products AS
SELECT
  id,
  establishment_id,
  category_id,
  name,
  description,
  price,
  image_url,
  display_order,
  CASE WHEN track_stock THEN stock_qty > 0 ELSE true END AS in_stock,
  is_featured,
  pizza_flavor_id
FROM products
WHERE is_active = true;

GRANT SELECT ON public_products TO anon, authenticated;
