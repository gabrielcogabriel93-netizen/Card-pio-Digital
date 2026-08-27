-- ============================================================
-- CatalogAI - Migration 038
-- Integra fidelidade com pedidos: colunas de resgate em `orders`,
-- validação pública (validate_loyalty_redemption, espelha validate_coupon
-- das migrations 008/015), saldo exposto em get_customer_profile, e as
-- duas camadas de trigger que fazem o crédito/débito de pontos.
--
-- DECISÃO DELIBERADA: esta é a primeira parte da contabilidade do
-- projeto (financeiro/estoque sempre foram feitos no client, ver
-- app/painel/pedidos/page.tsx handleUpdateStatus) que mora em TRIGGER de
-- banco. É proposital: pontos precisam ser creditados em pedidos que
-- ficam 'completed' por 4 caminhos diferentes, dois dos quais o client
-- não intercepta (webhook do Mercado Pago e o cron de automação por
-- tempo, ambos com admin client) e um que já nasce 'completed' via
-- INSERT direto (balcão) — só um trigger de banco cobre os 4 sem
-- duplicar a lógica de crédito em cada lugar.
-- ============================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS loyalty_reward_id UUID REFERENCES loyalty_rewards(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS loyalty_points_redeemed INT NOT NULL DEFAULT 0;

-- Cupom, desconto de aniversário (que usa coupon_code = 'ANIVERSARIO') e
-- resgate de pontos são mutuamente exclusivos nesta v1 — simplifica a
-- aritmética (o pedido continua tendo só uma coluna `discount`) e evita
-- empilhar descontos de fontes diferentes sem uma regra de precedência.
ALTER TABLE orders ADD CONSTRAINT orders_coupon_or_loyalty_exclusive
  CHECK (coupon_code IS NULL OR loyalty_reward_id IS NULL);

-- ============================================================
-- validate_loyalty_redemption: espelha validate_coupon (008/015) —
-- SECURITY DEFINER, nunca expõe saldo de outro cliente, só devolve
-- "válido/inválido" pro par (recompensa, telefone) informado.
-- ============================================================
CREATE OR REPLACE FUNCTION validate_loyalty_redemption(
  p_establishment_id UUID,
  p_reward_id UUID,
  p_customer_phone TEXT
)
RETURNS TABLE(valid BOOLEAN, benefit_type TEXT, benefit_value NUMERIC, points_cost INT, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings loyalty_settings%ROWTYPE;
  v_reward loyalty_rewards%ROWTYPE;
  v_balance INT;
  v_digits TEXT := regexp_replace(p_customer_phone, '\D', '', 'g');
BEGIN
  IF v_digits = '' THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::NUMERIC, NULL::INT, 'Informe seu telefone para resgatar pontos.'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_settings FROM loyalty_settings WHERE establishment_id = p_establishment_id;
  IF NOT FOUND OR NOT v_settings.is_active THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::NUMERIC, NULL::INT, 'Programa de fidelidade não está ativo nesta loja.'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_reward FROM loyalty_rewards
  WHERE id = p_reward_id AND establishment_id = p_establishment_id;
  IF NOT FOUND OR NOT v_reward.is_active THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::NUMERIC, NULL::INT, 'Recompensa não encontrada ou indisponível.'::TEXT;
    RETURN;
  END IF;

  SELECT loyalty_points_balance INTO v_balance FROM customers
  WHERE establishment_id = p_establishment_id AND phone = v_digits;

  IF v_balance IS NULL OR v_balance < v_reward.points_cost THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::NUMERIC, NULL::INT, 'Saldo de pontos insuficiente para esta recompensa.'::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_reward.benefit_type, v_reward.benefit_value, v_reward.points_cost, 'Recompensa aplicada!'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION validate_loyalty_redemption(UUID, UUID, TEXT) TO anon, authenticated;

-- get_customer_profile ganha o saldo de pontos — muda o RETURNS TABLE,
-- então precisa de DROP antes (Postgres não deixa CREATE OR REPLACE
-- mudar o formato de retorno; mesmo procedimento já usado nas migrations
-- 018 e 035). Reproduz a versão vigente da 035 (com rate limit e
-- birth_date) e só acrescenta loyalty_points_balance.
DROP FUNCTION IF EXISTS get_customer_profile(UUID, TEXT);

CREATE OR REPLACE FUNCTION get_customer_profile(p_establishment_id UUID, p_phone TEXT)
RETURNS TABLE(customer_id UUID, name TEXT, birth_date DATE, loyalty_points_balance INT, addresses JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id UUID;
  v_name TEXT;
  v_birth_date DATE;
  v_balance INT;
BEGIN
  IF NOT check_rate_limit('get_customer_profile', p_establishment_id::text, 60, INTERVAL '1 minute') THEN
    RAISE EXCEPTION 'Muitas consultas em pouco tempo. Aguarde um instante e tente novamente.';
  END IF;

  SELECT id, c.name, c.birth_date, c.loyalty_points_balance
    INTO v_customer_id, v_name, v_birth_date, v_balance
  FROM customers c
  WHERE c.establishment_id = p_establishment_id
    AND c.phone = regexp_replace(p_phone, '\D', '', 'g')
  LIMIT 1;

  IF v_customer_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    v_customer_id,
    v_name,
    v_birth_date,
    v_balance,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', a.id, 'label', a.label, 'street', a.street, 'number', a.number,
            'neighborhood', a.neighborhood, 'complement', a.complement,
            'reference', a.reference, 'zip_code', a.zip_code
          ) ORDER BY a.updated_at DESC
        )
        FROM customer_addresses a WHERE a.customer_id = v_customer_id
      ),
      '[]'::jsonb
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_customer_profile(UUID, TEXT) TO anon, authenticated;

-- ============================================================
-- Camada 2 (BEFORE INSERT): barra o INSERT mesmo que o client não tenha
-- revalidado — mesmo papel de enforce_coupon_customer_limit (015).
-- ============================================================
CREATE OR REPLACE FUNCTION enforce_loyalty_redemption_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_reward loyalty_rewards%ROWTYPE;
  v_balance INT;
BEGIN
  IF NEW.loyalty_reward_id IS NOT NULL THEN
    SELECT * INTO v_reward FROM loyalty_rewards
    WHERE id = NEW.loyalty_reward_id AND establishment_id = NEW.establishment_id;

    IF NOT FOUND OR NOT v_reward.is_active THEN
      RAISE EXCEPTION 'Recompensa de fidelidade inválida.';
    END IF;

    IF NEW.loyalty_points_redeemed <> v_reward.points_cost THEN
      RAISE EXCEPTION 'Custo em pontos da recompensa não confere.';
    END IF;

    SELECT loyalty_points_balance INTO v_balance FROM customers
    WHERE establishment_id = NEW.establishment_id
      AND phone = regexp_replace(NEW.customer_phone, '\D', '', 'g');

    IF v_balance IS NULL OR v_balance < v_reward.points_cost THEN
      RAISE EXCEPTION 'Saldo de pontos insuficiente para esta recompensa.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_enforce_loyalty_redemption_balance ON orders;
CREATE TRIGGER trg_enforce_loyalty_redemption_balance
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION enforce_loyalty_redemption_balance();

-- ============================================================
-- Trigger único (AFTER INSERT OR UPDATE): débito de resgate no INSERT,
-- crédito de ganho na primeira vez que status = 'completed', e estorno
-- dos dois quando um pedido sai de 'completed' para 'cancelled' (crédito)
-- ou é cancelado carregando um resgate ainda não estornado (débito).
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

  -- (2) CRÉDITO DE GANHO — primeira vez que o pedido fica 'completed'.
  IF (TG_OP = 'INSERT' AND NEW.status = 'completed')
     OR (TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed') THEN

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

DROP TRIGGER IF EXISTS trg_apply_loyalty_points_on_order_change ON orders;
CREATE TRIGGER trg_apply_loyalty_points_on_order_change
  AFTER INSERT OR UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION apply_loyalty_points_on_order_change();

-- Nota sobre idempotência: o trigger confia na trava otimista já usada
-- nos 4 caminhos de escrita de status (.eq('status', currentStatus) no
-- client/cron/webhook), que garante no máximo um UPDATE por transição
-- real de status — por isso não há um EXISTS extra de deduplicação no
-- ledger, mantendo o trigger no mesmo nível de simplicidade do resto do
-- projeto.
