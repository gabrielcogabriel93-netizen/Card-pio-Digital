-- ============================================================
-- CARDÁPIO SaaS - Migration 015
-- Limite de usos por cliente nos cupons (ex: cupom de "primeira
-- compra" só pode ser usado 1 vez pelo mesmo telefone). Até aqui só
-- existia `max_uses`, um limite GLOBAL somado entre todos os clientes
-- — não impedia a mesma pessoa de usar de novo.
--
-- Duas camadas de proteção, iguais ao padrão já usado no resto do
-- projeto (ex: prevent_order_spam):
-- 1. `validate_coupon` recebe o telefone e barra na hora de aplicar o
--    cupom no carrinho (feedback imediato pro cliente).
-- 2. Um TRIGGER em `orders` barra de novo no INSERT, pro caso de
--    alguém pular a validação e inserir o pedido direto — sem isso o
--    limite por cliente seria só "de fachada" no client.
-- ============================================================

ALTER TABLE coupons ADD COLUMN IF NOT EXISTS max_uses_per_customer INT;

-- validate_coupon ganhou um parâmetro novo (telefone) — CREATE OR
-- REPLACE não troca a lista de parâmetros de uma função, então precisa
-- derrubar a versão antiga primeiro (mesmo motivo do get_order_status
-- na migration 011).
DROP FUNCTION IF EXISTS validate_coupon(UUID, TEXT);

CREATE OR REPLACE FUNCTION validate_coupon(
  p_establishment_id UUID,
  p_code TEXT,
  p_customer_phone TEXT DEFAULT NULL
)
RETURNS TABLE(valid BOOLEAN, discount_type TEXT, discount_value NUMERIC, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c coupons%ROWTYPE;
  v_used_by_customer INT;
BEGIN
  SELECT * INTO c FROM coupons
  WHERE establishment_id = p_establishment_id
    AND upper(code) = upper(trim(p_code))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::NUMERIC, 'Cupom não encontrado.';
    RETURN;
  END IF;

  IF NOT c.is_active THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::NUMERIC, 'Cupom inativo.';
    RETURN;
  END IF;

  IF c.expires_at IS NOT NULL AND c.expires_at < now() THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::NUMERIC, 'Cupom expirado.';
    RETURN;
  END IF;

  IF c.max_uses IS NOT NULL AND c.used_count >= c.max_uses THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::NUMERIC, 'Cupom esgotado.';
    RETURN;
  END IF;

  -- Só dá pra checar o limite por cliente se o telefone já foi
  -- informado — no carrinho isso pode ainda não existir (o campo só
  -- aparece no passo seguinte, "Finalizar Pedido"). Por isso o pedido
  -- é validado de novo no envio, quando o telefone já é obrigatório.
  IF c.max_uses_per_customer IS NOT NULL AND p_customer_phone IS NOT NULL AND trim(p_customer_phone) <> '' THEN
    SELECT COUNT(*) INTO v_used_by_customer
    FROM orders o
    WHERE o.establishment_id = p_establishment_id
      AND upper(o.coupon_code) = upper(c.code)
      AND regexp_replace(o.customer_phone, '\D', '', 'g') = regexp_replace(p_customer_phone, '\D', '', 'g');

    IF v_used_by_customer >= c.max_uses_per_customer THEN
      RETURN QUERY SELECT false, NULL::TEXT, NULL::NUMERIC, 'Você já usou esse cupom o máximo de vezes permitido.'::TEXT;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT true, c.discount_type, c.discount_value, 'Cupom aplicado!'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION validate_coupon(UUID, TEXT, TEXT) TO anon, authenticated;

-- Camada 2: barra no INSERT mesmo que o client não tenha revalidado.
CREATE OR REPLACE FUNCTION enforce_coupon_customer_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_max_per_customer INT;
  v_used_by_customer INT;
BEGIN
  IF NEW.coupon_code IS NOT NULL THEN
    SELECT max_uses_per_customer INTO v_max_per_customer
    FROM coupons
    WHERE establishment_id = NEW.establishment_id AND upper(code) = upper(NEW.coupon_code)
    LIMIT 1;

    IF v_max_per_customer IS NOT NULL THEN
      SELECT COUNT(*) INTO v_used_by_customer
      FROM orders
      WHERE establishment_id = NEW.establishment_id
        AND upper(coupon_code) = upper(NEW.coupon_code)
        AND regexp_replace(customer_phone, '\D', '', 'g') = regexp_replace(NEW.customer_phone, '\D', '', 'g');

      IF v_used_by_customer >= v_max_per_customer THEN
        RAISE EXCEPTION 'Este cupom já atingiu o limite de usos para este cliente.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_enforce_coupon_customer_limit ON orders;

CREATE TRIGGER trg_enforce_coupon_customer_limit
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION enforce_coupon_customer_limit();
