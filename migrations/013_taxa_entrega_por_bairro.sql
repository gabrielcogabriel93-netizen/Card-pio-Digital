-- ============================================================
-- CARDÁPIO SaaS - Migration 013
-- Taxa de entrega por bairro: o lojista cadastra os bairros que atende
-- e o valor do frete de cada um; o cliente escolhe o bairro numa lista
-- (em vez de digitar em texto livre) e o frete é preenchido sozinho.
--
-- Continua existindo a "Taxa de entrega padrão" (establishments.delivery_fee)
-- — ela vira o fallback usado quando o lojista ainda não cadastrou
-- nenhum bairro, ou se o toggle abaixo estiver desligado. Assim, ativar
-- o recurso sem cadastrar bairro nenhum não quebra o checkout.
-- ============================================================

ALTER TABLE establishments ADD COLUMN IF NOT EXISTS use_neighborhood_delivery_fee BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS delivery_neighborhoods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_neighborhoods_establishment_id ON delivery_neighborhoods(establishment_id);

ALTER TABLE delivery_neighborhoods ENABLE ROW LEVEL SECURITY;

-- DROP antes de CREATE porque "CREATE POLICY" não tem IF NOT EXISTS no
-- Postgres — sem isso, rodar a migration de novo (ex: por engano, ou
-- pra reaplicar depois de um erro no meio do script) quebra com
-- "policy already exists".
DROP POLICY IF EXISTS "delivery_neighborhoods_select_owner" ON delivery_neighborhoods;
CREATE POLICY "delivery_neighborhoods_select_owner" ON delivery_neighborhoods
  FOR SELECT USING (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "delivery_neighborhoods_insert_owner" ON delivery_neighborhoods;
CREATE POLICY "delivery_neighborhoods_insert_owner" ON delivery_neighborhoods
  FOR INSERT WITH CHECK (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "delivery_neighborhoods_update_owner" ON delivery_neighborhoods;
CREATE POLICY "delivery_neighborhoods_update_owner" ON delivery_neighborhoods
  FOR UPDATE USING (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "delivery_neighborhoods_delete_owner" ON delivery_neighborhoods;
CREATE POLICY "delivery_neighborhoods_delete_owner" ON delivery_neighborhoods
  FOR DELETE USING (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));

-- View pública: só bairros ativos, sem colunas internas (is_active,
-- display_order, created_at) — mesmo padrão de public_products/public_establishments.
CREATE OR REPLACE VIEW public_delivery_neighborhoods AS
SELECT id, establishment_id, name, fee
FROM delivery_neighborhoods
WHERE is_active = true;

GRANT SELECT ON public_delivery_neighborhoods TO anon, authenticated;

-- public_establishments precisa expor o toggle pro cardápio saber se
-- deve mostrar o select de bairro em vez do campo de texto livre.
CREATE OR REPLACE VIEW public_establishments AS
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
  delivery_fee,
  offers_delivery,
  offers_pickup,
  order_tracking_enabled,
  use_neighborhood_delivery_fee
FROM establishments;

GRANT SELECT ON public_establishments TO anon, authenticated;
