-- ============================================================
-- CatalogAI - Migration 043
-- Reengajamento de cliente inativo: lista em /painel/whatsapp de
-- clientes que já pediram antes mas não pedem há mais de N dias
-- (configurável por loja), com botão "chamar de volta" que abre um
-- wa.me pré-preenchido -- mesmo padrão de link já usado em todo lugar
-- do produto, não é uma notificação automática (mesma limitação já
-- documentada na migration 042).
-- ============================================================

ALTER TABLE establishments ADD COLUMN IF NOT EXISTS inactive_customer_days INT NOT NULL DEFAULT 20;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_order_at TIMESTAMPTZ;

-- ============================================================
-- apply_loyalty_points_on_order_change (migration 038) já roda em todo
-- pedido que fica 'completed' e já garante a linha de `customers` --
-- só acrescenta a atualização de last_order_at ali, sem criar trigger
-- nova. Reproduz a função vigente da 038 inteira (CREATE OR REPLACE
-- não muda a assinatura, mas precisa do corpo completo).
-- ============================================================
CREATE OR REPLACE FUNCTION apply_loyalty_points_on_order_change()
RETURNS TRIGGER AS $$
DECLARE
  v_settings loyalty_settings%ROWTYPE;
  v_customer_id UUID;
  v_points_earned INT;
  v_earned_tx loyalty_transactions%ROWTYPE;
  v_redeem_tx loyalty_transactions%ROWTYPE;
BEGIN
  -- Garante a linha do cliente (pedido de balcão pode nunca ter passado
  -- por upsert_customer_profile).
  SELECT id INTO v_customer_id FROM customers
  WHERE establishment_id = NEW.establishment_id
    AND phone = regexp_replace(NEW.customer_phone, '\D', '', 'g');

  IF v_customer_id IS NULL THEN
    INSERT INTO customers (establishment_id, phone, name)
    VALUES (NEW.establishment_id, regexp_replace(NEW.customer_phone, '\D', '', 'g'), NEW.customer_name)
    ON CONFLICT (establishment_id, phone) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_customer_id;
  END IF;

  -- (1) DÉBITO DE RESGATE — só no INSERT (mesmo timing do consumo de
  -- cupom via increment_coupon_usage), não depende do status.
  IF TG_OP = 'INSERT' AND NEW.loyalty_reward_id IS NOT NULL AND NEW.loyalty_points_redeemed > 0 THEN
    UPDATE customers SET loyalty_points_balance = loyalty_points_balance - NEW.loyalty_points_redeemed, updated_at = now()
    WHERE id = v_customer_id;

    INSERT INTO loyalty_transactions (establishment_id, customer_id, order_id, reward_id, type, points, description)
    VALUES (NEW.establishment_id, v_customer_id, NEW.id, NEW.loyalty_reward_id, 'redeem', -NEW.loyalty_points_redeemed, 'Resgate de recompensa no pedido');
  END IF;

  -- (2) CRÉDITO DE GANHO + last_order_at — primeira vez que o pedido
  -- fica 'completed'. last_order_at atualiza sempre que o pedido
  -- completa, independente do programa de fidelidade estar ativo --
  -- é o que a lista de "clientes inativos" (migration 043) usa.
  IF (TG_OP = 'INSERT' AND NEW.status = 'completed')
     OR (TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed') THEN

    UPDATE customers SET last_order_at = NEW.created_at, updated_at = now()
    WHERE id = v_customer_id AND (last_order_at IS NULL OR last_order_at < NEW.created_at);

    SELECT * INTO v_settings FROM loyalty_settings WHERE establishment_id = NEW.establishment_id;

    IF FOUND AND v_settings.is_active
       AND (v_settings.min_order_value_for_points IS NULL OR NEW.total >= v_settings.min_order_value_for_points) THEN
      v_points_earned := floor(NEW.total * v_settings.points_per_currency);
      IF v_points_earned > 0 THEN
        UPDATE customers SET loyalty_points_balance = loyalty_points_balance + v_points_earned, updated_at = now()
        WHERE id = v_customer_id;

        INSERT INTO loyalty_transactions (establishment_id, customer_id, order_id, type, points, description)
        VALUES (NEW.establishment_id, v_customer_id, NEW.id, 'earn', v_points_earned, 'Pontos ganhos no pedido');
      END IF;
    END IF;
  END IF;

  -- (3) ESTORNO DE GANHO — pedido que ERA 'completed' virou 'cancelled'.
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' AND NEW.status = 'cancelled' THEN
    SELECT * INTO v_earned_tx FROM loyalty_transactions
    WHERE order_id = NEW.id AND type = 'earn' LIMIT 1;

    IF FOUND THEN
      UPDATE customers SET loyalty_points_balance = loyalty_points_balance - v_earned_tx.points, updated_at = now()
      WHERE id = v_customer_id;

      INSERT INTO loyalty_transactions (establishment_id, customer_id, order_id, type, points, description)
      VALUES (NEW.establishment_id, v_customer_id, NEW.id, 'revoke_earn', -v_earned_tx.points, 'Estorno: pedido cancelado após concluído');
    END IF;
  END IF;

  -- (4) ESTORNO DE RESGATE — qualquer cancelamento de um pedido que tinha
  -- resgate e ainda não foi estornado (cobre cancelar mesmo ainda
  -- 'pending', que nunca chegou a passar por 'completed').
  IF TG_OP = 'UPDATE' AND NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled'
     AND NEW.loyalty_reward_id IS NOT NULL THEN
    SELECT * INTO v_redeem_tx FROM loyalty_transactions
    WHERE order_id = NEW.id AND type = 'redeem' LIMIT 1;

    IF FOUND THEN
      UPDATE customers SET loyalty_points_balance = loyalty_points_balance + (-v_redeem_tx.points), updated_at = now()
      WHERE id = v_customer_id;

      INSERT INTO loyalty_transactions (establishment_id, customer_id, order_id, reward_id, type, points, description)
      VALUES (NEW.establishment_id, v_customer_id, NEW.id, NEW.loyalty_reward_id, 'revoke_redeem', -v_redeem_tx.points, 'Estorno: pedido com resgate foi cancelado');
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
