-- ============================================================
-- CatalogAI - Migration 036
-- Instagram da loja, exibido no novo painel "Sobre a loja" do cardápio
-- público (ver PublicMenuClient.tsx). Mesmo padrão da 030 (description):
-- coluna nova + CREATE OR REPLACE VIEW reexpondo TODAS as colunas já
-- públicas, não só a nova (senão as outras somem da view).
-- ============================================================

ALTER TABLE establishments ADD COLUMN IF NOT EXISTS instagram_url TEXT;

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
  e.description,
  e.instagram_url
FROM establishments e;

GRANT SELECT ON public_establishments TO anon, authenticated;
