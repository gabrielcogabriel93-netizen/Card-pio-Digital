-- ============================================================
-- CARDÁPIO SaaS - Migration 005
-- Fecha a exposição de colunas internas (owner_id, plan, stock_qty
-- exato) que hoje qualquer pessoa consegue ler direto pela API do
-- Supabase, já que RLS filtra LINHAS mas não colunas. A partir daqui,
-- o cardápio público lê apenas destas duas views, que só expõem o
-- necessário.
-- ============================================================

-- Taxa de entrega padrão da loja (usada também na migration da taxa de
-- entrega configurável — adicionada aqui porque a view abaixo já a expõe).
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10,2) DEFAULT 0;

-- Remove as policies antigas que liberavam a tabela inteira (todas as
-- colunas) para qualquer pessoa.
DROP POLICY IF EXISTS "establishments_select_public" ON establishments;
DROP POLICY IF EXISTS "products_select_public" ON products;

-- View pública do estabelecimento: só o que o cardápio precisa mostrar.
CREATE VIEW public_establishments AS
SELECT
  id,
  name,
  slug,
  whatsapp_number,
  logo_url,
  theme_color,
  address,
  opening_hours,
  is_open,
  delivery_fee
FROM establishments;

-- View pública de produtos: sem estoque exato, só "disponível ou não".
CREATE VIEW public_products AS
SELECT
  id,
  establishment_id,
  category_id,
  name,
  description,
  price,
  image_url,
  display_order,
  CASE WHEN track_stock THEN stock_qty > 0 ELSE true END AS in_stock
FROM products
WHERE is_active = true;

GRANT SELECT ON public_establishments TO anon, authenticated;
GRANT SELECT ON public_products TO anon, authenticated;
