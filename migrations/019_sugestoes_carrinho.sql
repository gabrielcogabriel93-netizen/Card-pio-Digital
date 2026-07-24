-- ============================================================
-- CARDÁPIO SaaS - Migration 019
-- Sugestão de produtos no carrinho — sempre controlada pelo LOJISTA,
-- nunca "adivinhada" por afinidade/IA (não tem como isso ser confiável
-- sem inventar dado). Duas ferramentas, as duas 100% manuais de configurar:
--
-- 1. `products.is_featured`: o lojista marca produtos como "sugestão" —
--    esses aparecem no carrinho como "Que tal adicionar também?".
-- 2. `establishments.free_shipping_threshold`: valor mínimo de compra
--    pra ganhar frete grátis. Se configurado, o carrinho mostra uma
--    barra "Faltam R$X pra frete grátis" com o valor real que falta —
--    de novo, nada inventado, é conta simples em cima do carrinho atual.
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS free_shipping_threshold NUMERIC(10,2);

-- View pública de produtos precisa expor is_featured pro carrinho saber
-- quais sugerir.
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
  is_featured,
  CASE WHEN track_stock THEN stock_qty > 0 ELSE true END AS in_stock
FROM products
WHERE is_active = true;

GRANT SELECT ON public_products TO anon, authenticated;

-- View pública do estabelecimento precisa expor o valor mínimo de frete grátis.
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
  use_neighborhood_delivery_fee,
  birthday_discount_percent,
  free_shipping_threshold
FROM establishments;

GRANT SELECT ON public_establishments TO anon, authenticated;
