-- ============================================================
-- CARDÁPIO SaaS - Migration 011
-- Tipo de negócio (com preparo / produto pronto / híbrido) + toggle de
-- acompanhamento detalhado de pedido + flag de onboarding concluído.
--
-- Ideia: nem toda loja precisa do Kanban completo (pendente -> confirmado
-- -> em preparo -> concluído). Quem vende produto pronto (loja de
-- conveniência, adega, papelaria etc.) só precisa saber "chegou pedido"
-- e "já entreguei" — sem etapa de preparo. O tipo é definido no quiz de
-- onboarding (logo após o cadastro) e pode ser mudado depois em
-- Configurações; o toggle de acompanhamento tem um valor sugerido pelo
-- tipo, mas o lojista pode ligar/desligar manualmente.
-- ============================================================

ALTER TABLE establishments ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT 'preparo'
  CHECK (business_type IN ('preparo', 'pronto', 'hibrido'));
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS order_tracking_enabled BOOLEAN DEFAULT true;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

-- Contas já existentes (criadas antes desta migration) não devem ser
-- forçadas a passar pelo quiz — já estão operando normalmente.
UPDATE establishments SET onboarding_completed = true WHERE onboarding_completed = false;

-- View pública precisa saber se o acompanhamento está ativo, para o
-- cardápio decidir se mostra o banner "Acompanhar pedido" e para a
-- página /pedido/[id] decidir entre timeline completa ou simplificada.
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
  order_tracking_enabled
FROM establishments;

GRANT SELECT ON public_establishments TO anon, authenticated;

-- get_order_status precisa devolver os dados novos (tema, tipo/endereço
-- do pedido, se o acompanhamento detalhado está ativo) para a página
-- pública de tracking se adaptar sem precisar de uma segunda consulta.
CREATE OR REPLACE FUNCTION get_order_status(p_order_id UUID)
RETURNS TABLE(
  id UUID,
  status TEXT,
  customer_name TEXT,
  items JSONB,
  subtotal NUMERIC,
  shipping_fee NUMERIC,
  discount NUMERIC,
  total NUMERIC,
  order_type TEXT,
  delivery_address JSONB,
  created_at TIMESTAMPTZ,
  establishment_name TEXT,
  establishment_slug TEXT,
  establishment_theme_color TEXT,
  order_tracking_enabled BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT o.id, o.status, o.customer_name, o.items, o.subtotal, o.shipping_fee,
         o.discount, o.total, o.order_type, o.delivery_address, o.created_at,
         e.name, e.slug, e.theme_color, COALESCE(e.order_tracking_enabled, true)
  FROM orders o
  JOIN establishments e ON e.id = o.establishment_id
  WHERE o.id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_order_status(UUID) TO anon, authenticated;
