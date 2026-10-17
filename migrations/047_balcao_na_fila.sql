-- ============================================================
-- Migration 047 -- venda de balcão pode ir para a fila de pedidos
-- (rodar DEPOIS da 045; pode rodar antes ou depois do deploy).
--
-- Antes, toda venda de balcão nascia "concluída" e nunca aparecia na
-- fila da cozinha. Agora, com send_to_kitchen = true no payload:
--   - acompanhamento de etapas ligado: entra direto "Em preparo";
--   - acompanhamento desligado: entra em "Novos" e o lojista conclui.
-- Sem a flag (app antigo), continua concluída na hora, como antes.
-- ============================================================

CREATE OR REPLACE FUNCTION balcao_sale(p_payload JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_est_id UUID := (p_payload->>'establishment_id')::uuid;
  v_items JSONB := COALESCE(p_payload->'items', '[]'::jsonb);
  v_item JSONB;
  v_sel JSONB;
  v_qty INT;
  v_stock RECORD;
  v_subtotal NUMERIC;
  v_discount NUMERIC := GREATEST(COALESCE(NULLIF(p_payload->>'discount', '')::numeric, 0), 0);
  v_total NUMERIC;
  v_id UUID := gen_random_uuid();
  v_tracking BOOLEAN;
  v_status TEXT := 'completed';
  o orders%ROWTYPE;
BEGIN
  SELECT COALESCE(order_tracking_enabled, true) INTO v_tracking
  FROM establishments WHERE id = v_est_id AND owner_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loja não encontrada.';
  END IF;
  IF jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Adicione itens à venda.';
  END IF;
  IF COALESCE((p_payload->>'send_to_kitchen')::boolean, false) THEN
    v_status := CASE WHEN v_tracking THEN 'preparing' ELSE 'pending' END;
  END IF;

  -- Confere estoque com trava de linha antes de vender.
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::int, 0);
    IF v_qty < 1 THEN
      RAISE EXCEPTION 'Quantidade inválida.';
    END IF;
    FOR v_sel IN
      SELECT * FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(v_item->'combo_selections') = 'array' AND jsonb_array_length(v_item->'combo_selections') > 0
             THEN v_item->'combo_selections' ELSE jsonb_build_array(v_item) END)
    LOOP
      SELECT name, stock_qty, track_stock INTO v_stock FROM products
      WHERE id = (v_sel->>'product_id')::uuid AND establishment_id = v_est_id FOR UPDATE;
      IF FOUND AND v_stock.track_stock AND v_stock.stock_qty < v_qty THEN
        RAISE EXCEPTION 'Estoque insuficiente de % (disponível: %).', v_stock.name, v_stock.stock_qty;
      END IF;
    END LOOP;
  END LOOP;

  SELECT round(COALESCE(SUM((i->>'total_price')::numeric), 0), 2) INTO v_subtotal FROM jsonb_array_elements(v_items) i;
  v_discount := LEAST(round(v_discount, 2), v_subtotal);
  v_total := v_subtotal - v_discount;

  INSERT INTO orders (id, establishment_id, customer_name, customer_phone, items, subtotal, shipping_fee, discount, total,
                      status, source, order_type, payment_method, change_for, discount_source, notes,
                      accepted_at, completed_at)
  VALUES (v_id, v_est_id,
          COALESCE(NULLIF(left(trim(COALESCE(p_payload->>'customer_name', '')), 80), ''), 'Consumidor final'),
          left(trim(COALESCE(p_payload->>'customer_phone', '')), 30),
          v_items, v_subtotal, 0, v_discount, v_total, v_status, 'balcao', 'pickup',
          NULLIF(p_payload->>'payment_method', ''), NULLIF(p_payload->>'change_for', '')::numeric,
          CASE WHEN v_discount > 0 THEN 'manual' END,
          NULLIF(left(trim(COALESCE(p_payload->>'notes', '')), 300), ''),
          CASE WHEN v_status <> 'pending' THEN now() END,
          CASE WHEN v_status = 'completed' THEN now() END)
  RETURNING * INTO o;

  -- Em "Novos", financeiro e estoque ficam para o aceite (accept_order),
  -- igual a um pedido online; nos outros casos já entram agora.
  IF v_status <> 'pending' THEN
    PERFORM apply_first_acceptance(o);
  END IF;
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION balcao_sale(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION balcao_sale(JSONB) TO authenticated;
