-- ============================================================
-- CARDÁPIO SaaS - Migration 009
-- Acompanhamento público do pedido por link (/pedido/[id]).
--
-- Não damos SELECT público direto na tabela orders (isso permitiria
-- listar os pedidos de qualquer loja). Em vez disso, uma função
-- SECURITY DEFINER retorna os dados de UM pedido específico — só
-- funciona para quem já sabe o UUID exato (recebido na hora de fazer o
-- pedido), que é praticamente impossível de adivinhar.
-- ============================================================

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
  created_at TIMESTAMPTZ,
  establishment_name TEXT,
  establishment_slug TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT o.id, o.status, o.customer_name, o.items, o.subtotal, o.shipping_fee,
         o.discount, o.total, o.created_at, e.name, e.slug
  FROM orders o
  JOIN establishments e ON e.id = o.establishment_id
  WHERE o.id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_order_status(UUID) TO anon, authenticated;
