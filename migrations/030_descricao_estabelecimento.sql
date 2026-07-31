-- ============================================================
-- CatalogAI - Migration 030
-- Descrição da loja (Configurações > Dados do Estabelecimento) — usada
-- no preview de link (Open Graph/Twitter Card) quando o lojista
-- compartilha o cardápio no WhatsApp, Instagram etc. Sem isso, o texto
-- do preview era sempre genérico ("Confira o cardápio de X..."); com a
-- coluna preenchida, o lojista controla o que aparece.
-- ============================================================

ALTER TABLE establishments ADD COLUMN IF NOT EXISTS description TEXT;

-- View pública precisa expor a descrição pro generateMetadata de
-- /loja/[slug] usar. CREATE OR REPLACE VIEW só aceita adicionar coluna
-- no final (mesmo padrão de todas as migrations anteriores que tocam
-- essa view).
CREATE OR REPLACE VIEW public_establishments AS
SELECT
  e.id,
  e.name,
  e.slug,
  e.whatsapp_number,
  e.logo_url,
  e.theme_color,
  e.address,
  e.opening_hours,
  e.is_open,
  e.delivery_fee,
  e.offers_delivery,
  e.offers_pickup,
  e.order_tracking_enabled,
  e.use_neighborhood_delivery_fee,
  e.birthday_discount_percent,
  e.free_shipping_threshold,
  e.pix_key,
  e.pix_city,
  e.custom_domain,
  EXISTS (
    SELECT 1 FROM mercadopago_accounts ma
    WHERE ma.establishment_id = e.id AND ma.is_active = true
  ) AND e.billing_mode = 'comissao' AS mercadopago_pix_enabled,
  e.description
FROM establishments e;

GRANT SELECT ON public_establishments TO anon, authenticated;
