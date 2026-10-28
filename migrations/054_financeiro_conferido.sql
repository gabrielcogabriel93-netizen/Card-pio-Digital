-- Freguês - Migration 054: financeiro conferido
--
-- Auditoria do financeiro (out/2026):
-- 1. Pedidos aceitos antes da 045 pelo código antigo do painel podiam
--    ganhar a mesma entrada duas vezes (dois cliques) ou nenhuma (venda
--    de balcão antiga). Remove as duplicadas e lança as que faltam, na
--    data da venda.
-- 2. O banco passa a garantir uma entrada por pedido (índice único) e o
--    lojista só lança à mão o que não é de pedido: uma aba antiga do
--    painel aberta não consegue mais duplicar.
-- 3. Fechar comanda vira SECURITY DEFINER (com checagem do dono), porque
--    a regra acima bloquearia o insert feito com o privilégio do lojista.
-- 4. Cancelar remove qualquer lançamento do pedido (inclusive a tarifa do
--    Mercado Pago gravada pelo webhook), não só quando já tinha aceite.

-- 1a. Duplicadas: fica a primeira de cada pedido.
DELETE FROM financial_entries fe
USING financial_entries keep
WHERE fe.order_id IS NOT NULL
  AND keep.order_id = fe.order_id
  AND keep.type = fe.type
  AND COALESCE(keep.description, '') = COALESCE(fe.description, '')
  AND (keep.created_at, keep.id) < (fe.created_at, fe.id);

-- 1b. Pedidos aceitos (fora mesa) sem entrada: lança com a data da venda.
INSERT INTO financial_entries (establishment_id, order_id, type, amount, description, created_at)
SELECT o.establishment_id, o.id, 'income', o.total,
       'Pedido #' || substr(o.id::text, 1, 8) || ' - ' || COALESCE(o.customer_name, 'Cliente'),
       COALESCE(o.accepted_at, o.completed_at, o.created_at)
FROM orders o
WHERE o.status IN ('confirmed', 'preparing', 'completed')
  AND o.source IS DISTINCT FROM 'mesa'
  AND NOT EXISTS (SELECT 1 FROM financial_entries fe WHERE fe.order_id = o.id AND fe.type = 'income');

-- 1c. Mesa: pedido concluído de comanda já fechada sem entrada.
INSERT INTO financial_entries (establishment_id, order_id, type, amount, description, created_at)
SELECT o.establishment_id, o.id, 'income', o.total,
       'Comanda mesa - pedido #' || substr(o.id::text, 1, 8),
       COALESCE(t.closed_at, o.completed_at, o.created_at)
FROM orders o
JOIN table_tabs t ON t.id = o.table_tab_id
WHERE o.source = 'mesa' AND o.status = 'completed' AND t.status = 'closed'
  AND NOT EXISTS (SELECT 1 FROM financial_entries fe WHERE fe.order_id = o.id AND fe.type = 'income');

-- 2. Uma entrada de venda por pedido; cada despesa do pedido uma vez só.
CREATE UNIQUE INDEX IF NOT EXISTS financial_entries_one_income_per_order
  ON financial_entries (order_id) WHERE order_id IS NOT NULL AND type = 'income';
CREATE UNIQUE INDEX IF NOT EXISTS financial_entries_one_expense_kind_per_order
  ON financial_entries (order_id, description) WHERE order_id IS NOT NULL AND type = 'expense';
CREATE INDEX IF NOT EXISTS idx_financial_entries_est_created
  ON financial_entries (establishment_id, created_at);

DROP POLICY IF EXISTS "financial_entries_insert_owner" ON financial_entries;
CREATE POLICY "financial_entries_insert_owner" ON financial_entries
  FOR INSERT WITH CHECK (
    order_id IS NULL AND establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid())
  );

-- 3. Fechamento da comanda (mesma regra da 039, agora com dono checado aqui).
CREATE OR REPLACE FUNCTION close_table_tab(p_tab_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tab RECORD;
  v_open_orders INT;
  v_total NUMERIC(10,2);
BEGIN
  SELECT * INTO v_tab FROM table_tabs WHERE id = p_tab_id FOR UPDATE;

  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM establishments WHERE id = v_tab.establishment_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Comanda não encontrada ou você não tem acesso a ela.';
  END IF;

  IF v_tab.status <> 'open' THEN
    RAISE EXCEPTION 'Essa comanda já foi fechada.';
  END IF;

  SELECT COUNT(*) INTO v_open_orders FROM orders
  WHERE table_tab_id = p_tab_id AND status NOT IN ('completed', 'cancelled');

  IF v_open_orders > 0 THEN
    RAISE EXCEPTION 'Essa comanda ainda tem % pedido(s) não concluído(s). Finalize todos os pedidos da mesa em Pedidos antes de fechar a conta.', v_open_orders;
  END IF;

  SELECT COALESCE(SUM(total), 0) INTO v_total FROM orders
  WHERE table_tab_id = p_tab_id AND status = 'completed';

  INSERT INTO financial_entries (establishment_id, order_id, type, amount, description)
  SELECT o.establishment_id, o.id, 'income', o.total,
         'Comanda mesa - pedido #' || substr(o.id::text, 1, 8)
  FROM orders o
  WHERE o.table_tab_id = p_tab_id AND o.status = 'completed'
    AND NOT EXISTS (SELECT 1 FROM financial_entries fe WHERE fe.order_id = o.id AND fe.type = 'income');

  UPDATE table_tabs SET status = 'closed', closed_at = now(), closed_total = v_total WHERE id = p_tab_id;

  RETURN v_total;
END;
$$;

REVOKE EXECUTE ON FUNCTION close_table_tab(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION close_table_tab(UUID) TO authenticated;

-- 4. Cancelamento (igual à 045; o financeiro do pedido sai sempre).
CREATE OR REPLACE FUNCTION cancel_order(p_order_id UUID, p_reason TEXT)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o orders%ROWTYPE;
  v_was_accepted BOOLEAN;
BEGIN
  o := assert_order_owner(p_order_id);
  IF o.status = 'cancelled' THEN
    RAISE EXCEPTION 'Este pedido já está cancelado.';
  END IF;
  IF COALESCE(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Informe o motivo do cancelamento.';
  END IF;
  v_was_accepted := o.status IN ('confirmed', 'preparing', 'completed');

  UPDATE orders SET status = 'cancelled', cancellation_reason = left(trim(p_reason), 300)
  WHERE id = o.id
  RETURNING * INTO o;

  IF v_was_accepted THEN
    PERFORM adjust_stock_for_items(o.establishment_id, o.items, -1);
  END IF;
  DELETE FROM financial_entries WHERE order_id = o.id;

  -- Comanda já fechada: o total guardado acompanha o cancelamento.
  IF o.table_tab_id IS NOT NULL THEN
    UPDATE table_tabs SET closed_total = (
      SELECT COALESCE(SUM(total), 0) FROM orders WHERE table_tab_id = o.table_tab_id AND status = 'completed'
    ) WHERE id = o.table_tab_id AND status = 'closed';
  END IF;
  RETURN o;
END;
$$;
