-- ============================================================
-- CARDÁPIO SaaS - Migration 022
-- "Mais vendido" no cardápio público: dado real, calculado a partir dos
-- pedidos aceitos dos últimos 30 dias — nunca uma estimativa/inventado.
-- Função pública só devolve a contagem agregada (produto + quantidade),
-- nunca os pedidos em si, então não vaza dado de cliente nenhum.
-- ============================================================

CREATE OR REPLACE FUNCTION get_bestseller_products(p_establishment_id UUID, p_limit INT DEFAULT 3)
RETURNS TABLE(product_id UUID, quantity_sold BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (item->>'product_id')::UUID AS product_id,
    SUM((item->>'quantity')::INT)::BIGINT AS quantity_sold
  FROM orders o, jsonb_array_elements(o.items) AS item
  WHERE o.establishment_id = p_establishment_id
    AND o.status IN ('confirmed', 'preparing', 'completed')
    AND o.created_at > now() - INTERVAL '30 days'
  GROUP BY item->>'product_id'
  ORDER BY quantity_sold DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_bestseller_products(UUID, INT) TO anon, authenticated;
