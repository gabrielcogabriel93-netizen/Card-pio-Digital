-- ============================================================
-- CARDÁPIO SaaS - Migration 017
-- Forma de pagamento escolhida pelo CLIENTE no checkout público (até
-- aqui só o lojista escolhia, e só na hora de confirmar o pedido).
--
-- A coluna `payment_method` já existe desde a migration 001 — não
-- precisa de ALTER TABLE. O que faltava era a função pública de
-- acompanhamento (`get_order_status`) devolver esse dado (e também
-- `payment_method`, `coupon_code` e `notes`, que o cliente já vê em
-- outras telas mas não na página de acompanhamento).
-- ============================================================

-- Muda as colunas do retorno (RETURNS TABLE) — precisa derrubar a
-- função antes, "CREATE OR REPLACE" só troca o corpo quando a
-- assinatura de retorno é idêntica (mesmo caso da migration 011).
DROP FUNCTION IF EXISTS get_order_status(UUID);

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
  payment_method TEXT,
  coupon_code TEXT,
  notes TEXT,
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
         o.discount, o.total, o.order_type, o.delivery_address, o.payment_method,
         o.coupon_code, o.notes, o.created_at,
         e.name, e.slug, e.theme_color, COALESCE(e.order_tracking_enabled, true)
  FROM orders o
  JOIN establishments e ON e.id = o.establishment_id
  WHERE o.id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_order_status(UUID) TO anon, authenticated;
