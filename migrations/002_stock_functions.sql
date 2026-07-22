-- ============================================================
-- CARDÁPIO SaaS - Migration 002
-- Funções de controle de estoque (usadas ao confirmar/cancelar pedidos)
-- ============================================================

-- Baixa de estoque: nunca deixa ficar negativo
CREATE OR REPLACE FUNCTION decrement_product_stock(product_id UUID, quantity INT)
RETURNS VOID AS $$
BEGIN
  UPDATE products
  SET stock_qty = GREATEST(stock_qty - quantity, 0)
  WHERE id = product_id;
END;
$$ LANGUAGE plpgsql;

-- Estorno de estoque (ex: pedido confirmado/preparo é cancelado depois da baixa)
CREATE OR REPLACE FUNCTION increment_product_stock(product_id UUID, quantity INT)
RETURNS VOID AS $$
BEGIN
  UPDATE products
  SET stock_qty = stock_qty + quantity
  WHERE id = product_id;
END;
$$ LANGUAGE plpgsql;
