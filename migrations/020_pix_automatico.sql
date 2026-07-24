-- ============================================================
-- CARDÁPIO SaaS - Migration 020
-- Pix com QR Code / copia-e-cola gerado automaticamente. Não usa
-- gateway nenhum — é só a chave Pix do próprio lojista formatada no
-- padrão EMV do Banco Central (ver lib/pix.ts). Sem taxa, sem
-- integração externa, sem custo.
-- ============================================================

ALTER TABLE establishments ADD COLUMN IF NOT EXISTS pix_key TEXT;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS pix_key_type TEXT;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS pix_city TEXT;

-- View pública precisa expor a chave e a cidade pro cardápio gerar o QR
-- na hora — o nome do estabelecimento já é público.
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
  free_shipping_threshold,
  pix_key,
  pix_city
FROM establishments;

GRANT SELECT ON public_establishments TO anon, authenticated;
