-- ============================================================
-- Freguês - Migration 061
-- Pratos em 3D e realidade aumentada ("Ver na minha mesa").
-- O lojista envia o modelo 3D do prato (.glb; opcionalmente o .usdz do
-- iPhone) para uploads/{establishment_id}/models/. O cardápio mostra o
-- prato em 3D e abre a realidade aumentada no celular do cliente.
-- Depende da 060 (product_price_now / product_available_today).
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS model_3d_url TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS model_3d_ios_url TEXT;

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_model_3d_url_https;
ALTER TABLE products ADD CONSTRAINT products_model_3d_url_https
  CHECK (model_3d_url IS NULL OR model_3d_url ~ '^https://');
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_model_3d_ios_url_https;
ALTER TABLE products ADD CONSTRAINT products_model_3d_ios_url_https
  CHECK (model_3d_ios_url IS NULL OR model_3d_ios_url ~ '^https://');

-- Mesma vitrine da 060, com as duas colunas novas no fim.
CREATE OR REPLACE VIEW public_products AS
SELECT
  id,
  establishment_id,
  category_id,
  name,
  description,
  product_price_now(products)::numeric(10,2) AS price,
  image_url,
  display_order,
  (CASE WHEN track_stock THEN stock_qty > 0 ELSE true END)
    AND (sold_out_until IS NULL OR sold_out_until <= now())
    AND product_available_today(products) AS in_stock,
  is_featured,
  pizza_flavor_id,
  CASE WHEN product_price_now(products) < price THEN price END::numeric(10,2) AS original_price,
  CASE WHEN product_price_now(products) < price THEN promo_until END AS promo_until,
  available_weekdays,
  model_3d_url,
  model_3d_ios_url
FROM products
WHERE is_active = true;

GRANT SELECT ON public_products TO anon, authenticated;
