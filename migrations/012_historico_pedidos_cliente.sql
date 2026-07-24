-- ============================================================
-- CARDÁPIO SaaS - Migration 012
-- "Meus Pedidos": o cliente final não tem conta/login (fricção baixa é
-- proposital, ver README), mas pode consultar o histórico de pedidos de
-- UMA loja informando o próprio telefone — o mesmo dado que ele já
-- digita a cada pedido.
--
-- Trade-off de segurança consciente: como não há senha, quem souber o
-- telefone de outra pessoa e o slug da loja consegue ver esse histórico
-- (nomes de itens, status, valores — nunca dados de pagamento). Achamos
-- esse risco aceitável para o tamanho do produto; a comparação de
-- números normaliza para dígitos, então funciona independente de
-- formatação. Resultado limitado às últimas 20 compras.
-- ============================================================

CREATE OR REPLACE FUNCTION get_orders_by_phone(p_establishment_id UUID, p_phone TEXT)
RETURNS TABLE(
  id UUID,
  status TEXT,
  items JSONB,
  total NUMERIC,
  order_type TEXT,
  source TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF regexp_replace(p_phone, '\D', '', 'g') = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT o.id, o.status, o.items, o.total, o.order_type, o.source, o.created_at
  FROM orders o
  WHERE o.establishment_id = p_establishment_id
    AND regexp_replace(o.customer_phone, '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g')
  ORDER BY o.created_at DESC
  LIMIT 20;
END;
$$;

GRANT EXECUTE ON FUNCTION get_orders_by_phone(UUID, TEXT) TO anon, authenticated;
