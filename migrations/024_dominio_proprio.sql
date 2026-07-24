-- ============================================================
-- CARDÁPIO SaaS - Migration 024
-- Domínio próprio por loja: o lojista pode apontar um domínio dele
-- (ex: cardapio.minhaloja.com.br) direto pro cardápio público, sem
-- precisar do /loja/[slug]. Esta migration só cria a coluna e expõe
-- na view pública (o middleware usa a view pública pra resolver o
-- host sem precisar de service role).
--
-- Depois de rodar isso, o lojista ainda precisa, manualmente:
--   1. Criar um registro CNAME no DNS do domínio dele apontando para
--      cname.vercel-dns.com (ou o que a Vercel indicar).
--   2. Adicionar esse domínio em Vercel > Project > Settings > Domains.
-- Sem isso, preencher o campo no painel não tem efeito nenhum.
-- ============================================================

ALTER TABLE establishments ADD COLUMN IF NOT EXISTS custom_domain TEXT UNIQUE;

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
  pix_city,
  custom_domain
FROM establishments;

GRANT SELECT ON public_establishments TO anon, authenticated;
