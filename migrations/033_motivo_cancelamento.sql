-- ============================================================
-- Motivo do cancelamento: quando o estabelecimento cancela um pedido,
-- agora precisa informar o motivo (exigido na tela, ver
-- app/painel/pedidos/page.tsx) — e esse motivo passa a ser exibido pro
-- cliente na página de acompanhamento (app/pedido/[id]/page.tsx), que
-- antes só mostrava "Pedido cancelado" sem explicação nenhuma.
-- ============================================================

ALTER TABLE orders ADD COLUMN cancellation_reason TEXT;

-- get_order_status (migration 026) precisa devolver o motivo pro cliente
-- ver na tela de acompanhamento.
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
  order_tracking_enabled BOOLEAN,
  payment_status TEXT,
  cancellation_reason TEXT
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
         e.name, e.slug, e.theme_color, COALESCE(e.order_tracking_enabled, true),
         o.payment_status, o.cancellation_reason
  FROM orders o
  JOIN establishments e ON e.id = o.establishment_id
  WHERE o.id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_order_status(UUID) TO anon, authenticated;
