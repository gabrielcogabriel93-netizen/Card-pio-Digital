-- ============================================================
-- CatalogAI - Migration 040
-- Sistema de combos: kits de produtos com preço fixo definido pelo
-- lojista. Serve pra QUALQUER tipo de negócio (não só comida) -- um
-- combo é só "N grupos de escolha, cada um com produtos elegíveis do
-- próprio catálogo do lojista". Ex: "Combo Família" (pizza + refri +
-- sobremesa), "Kit Promocional" (camisa + calça), "Combo Lanche"
-- (sanduíche + batata + bebida).
--
-- PREÇO: fixo (combos.price), definido pelo lojista -- NÃO é soma dos
-- produtos escolhidos. As escolhas do cliente nunca mudam o total, só
-- aparecem como informação (linhas de `variations`, igual pizza/
-- variação já fazem hoje).
--
-- SLOT DE PIZZA (opcional, só quem vende pizza usa): quando
-- is_pizza_slot = true, os produtos elegíveis do grupo são produtos-
-- sabor que já existem no catálogo (mesma linha usada no pedido avulso
-- de pizza, migration 025 -- products.pizza_flavor_id preenchido).
-- O TAMANHO fica fixo em fixed_pizza_size_id, escolhido pelo lojista
-- ao montar o combo -- o cliente NÃO escolhe tamanho dentro do combo
-- (diferente do PizzaOrderModal avulso). Por isso não existe tabela
-- nova ligando combo a sabor: combo_group_products já aponta pros
-- mesmos produtos de sempre.
--
-- QUANTAS ESCOLHAS POR GRUPO: v1 sempre exige exatamente 1 produto
-- (min_select = max_select = 1, aplicado na UI). As colunas já
-- existem com esse default pra permitir multi-escolha futura (ex:
-- "escolha 2 bebidas") sem precisar de migração nova.
-- ============================================================

CREATE TABLE combos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Grupos de escolha do combo ("slots"). Nome livre, definido pelo
-- lojista -- não há nada pizza-específico na tabela em si.
CREATE TABLE combo_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id UUID REFERENCES combos(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  display_order INT DEFAULT 0,
  is_pizza_slot BOOLEAN NOT NULL DEFAULT false,
  fixed_pizza_size_id UUID REFERENCES pizza_sizes(id) ON DELETE SET NULL,
  min_select INT NOT NULL DEFAULT 1 CHECK (min_select >= 1),
  max_select INT NOT NULL DEFAULT 1 CHECK (max_select >= min_select),
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT combo_groups_pizza_slot_needs_size
    CHECK (NOT is_pizza_slot OR fixed_pizza_size_id IS NOT NULL)
);

-- Produtos elegíveis por grupo -- sempre produtos que já existem no
-- catálogo do próprio lojista (roupa, comida, papelaria, o que for).
CREATE TABLE combo_group_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_group_id UUID REFERENCES combo_groups(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (combo_group_id, product_id)
);

CREATE INDEX idx_combos_establishment_id ON combos(establishment_id);
CREATE INDEX idx_combo_groups_combo_id ON combo_groups(combo_id);
CREATE INDEX idx_combo_group_products_combo_group_id ON combo_group_products(combo_group_id);
CREATE INDEX idx_combo_group_products_product_id ON combo_group_products(product_id);

-- ============================================================
-- RLS -- mesmo padrão de pizza_sizes/pizza_flavors (migration 025):
-- SELECT público liberado (dado não sensível, precisa aparecer no
-- cardápio anônimo), CRUD restrito ao dono via cadeia de join até
-- establishments. Sem função SECURITY DEFINER: não existe nenhuma
-- escrita anônima aqui (diferente de mesas/comandas, migration 039),
-- só leitura pública + escrita do dono.
-- ============================================================
ALTER TABLE combos ENABLE ROW LEVEL SECURITY;
ALTER TABLE combo_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE combo_group_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "combos_select_public" ON combos FOR SELECT USING (true);
CREATE POLICY "combos_owner_all" ON combos FOR ALL USING (
  establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid())
) WITH CHECK (
  establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid())
);

CREATE POLICY "combo_groups_select_public" ON combo_groups FOR SELECT USING (true);
CREATE POLICY "combo_groups_owner_all" ON combo_groups FOR ALL USING (
  combo_id IN (SELECT c.id FROM combos c JOIN establishments e ON e.id = c.establishment_id WHERE e.owner_id = auth.uid())
) WITH CHECK (
  combo_id IN (SELECT c.id FROM combos c JOIN establishments e ON e.id = c.establishment_id WHERE e.owner_id = auth.uid())
);

CREATE POLICY "combo_group_products_select_public" ON combo_group_products FOR SELECT USING (true);
CREATE POLICY "combo_group_products_owner_all" ON combo_group_products FOR ALL USING (
  combo_group_id IN (
    SELECT g.id FROM combo_groups g JOIN combos c ON c.id = g.combo_id
    JOIN establishments e ON e.id = c.establishment_id WHERE e.owner_id = auth.uid()
  )
) WITH CHECK (
  combo_group_id IN (
    SELECT g.id FROM combo_groups g JOIN combos c ON c.id = g.combo_id
    JOIN establishments e ON e.id = c.establishment_id WHERE e.owner_id = auth.uid()
  )
);
