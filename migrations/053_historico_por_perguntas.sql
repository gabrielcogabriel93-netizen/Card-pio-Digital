-- ============================================================
-- Migration 053 -- ver o histórico de pedidos em qualquer aparelho
-- (rodar DEPOIS da 045; pode rodar antes ou depois do deploy).
--
-- O cliente confirma que o telefone é dele respondendo duas perguntas de
-- múltipla escolha sobre o último pedido (um item e o valor). Acertando,
-- o aparelho recebe um token com alcance só de HISTÓRICO: vê os pedidos e
-- pede de novo. Endereços salvos, perfil e resgate de pontos continuam
-- exigindo o token completo (confirmação pelo número do pedido).
--
-- Contra chute: 2 perguntas de 4 opções (1 chance em 16), uma tentativa
-- por desafio e no máximo 3 desafios por telefone a cada 24 horas.
-- ============================================================

-- 1. Alcance do token
ALTER TABLE customer_tokens ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'full';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_tokens_scope_check') THEN
    ALTER TABLE customer_tokens ADD CONSTRAINT customer_tokens_scope_check CHECK (scope IN ('full', 'history'));
  END IF;
END $$;

-- Token completo (endereços, perfil, pontos): só scope 'full'.
CREATE OR REPLACE FUNCTION customer_token_valid(p_establishment_id UUID, p_phone_digits TEXT, p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 OR p_phone_digits = '' THEN
    RETURN false;
  END IF;
  UPDATE customer_tokens SET last_used_at = now()
  WHERE establishment_id = p_establishment_id AND phone = p_phone_digits AND token_hash = hash_secret(p_token) AND scope = 'full'
  RETURNING id INTO v_id;
  RETURN v_id IS NOT NULL;
END;
$$;

-- Histórico: aceita os dois alcances.
CREATE OR REPLACE FUNCTION customer_history_token_valid(p_establishment_id UUID, p_phone_digits TEXT, p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 OR p_phone_digits = '' THEN
    RETURN false;
  END IF;
  UPDATE customer_tokens SET last_used_at = now()
  WHERE establishment_id = p_establishment_id AND phone = p_phone_digits AND token_hash = hash_secret(p_token)
  RETURNING id INTO v_id;
  RETURN v_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION get_orders_by_phone(p_establishment_id UUID, p_phone TEXT, p_token TEXT)
RETURNS TABLE(id UUID, status TEXT, items JSONB, total NUMERIC, order_type TEXT, source TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits TEXT := phone_digits(p_phone);
BEGIN
  IF NOT check_rate_limit('get_orders_by_phone', p_establishment_id::text || ':' || request_ip(), 30, INTERVAL '1 minute') THEN
    RAISE EXCEPTION 'Muitas consultas em pouco tempo. Aguarde um instante e tente novamente.';
  END IF;
  IF NOT customer_history_token_valid(p_establishment_id, v_digits, p_token) THEN
    RAISE EXCEPTION 'Confirme seu telefone para ver seus pedidos neste aparelho.';
  END IF;
  RETURN QUERY
  SELECT o.id, o.status, o.items, o.total, o.order_type, o.source, o.created_at
  FROM orders o
  WHERE o.establishment_id = p_establishment_id AND phone_digits(o.customer_phone) = v_digits
  ORDER BY o.created_at DESC
  LIMIT 20;
END;
$$;

-- 2. Perguntas sobre o último pedido
CREATE TABLE IF NOT EXISTS customer_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE NOT NULL,
  phone TEXT NOT NULL,
  item_hash TEXT NOT NULL,
  total_hash TEXT NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '10 minutes'
);
CREATE INDEX IF NOT EXISTS idx_customer_challenges_phone ON customer_challenges(establishment_id, phone, created_at DESC);
ALTER TABLE customer_challenges ENABLE ROW LEVEL SECURITY; -- sem policy: só as funções abaixo

CREATE OR REPLACE FUNCTION brl_text(p_value NUMERIC)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'R$ ' || replace(to_char(round(p_value, 2), 'FM999990.00'), '.', ',');
$$;

-- Devolve o desafio (ou NULL se o telefone não tem pedido nesta loja).
CREATE OR REPLACE FUNCTION start_customer_challenge(p_establishment_id UUID, p_phone TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits TEXT := phone_digits(p_phone);
  v_order orders%ROWTYPE;
  v_item TEXT;
  v_items TEXT[];
  v_decoys TEXT[];
  v_totals NUMERIC[];
  v_factor NUMERIC;
  v_candidate NUMERIC;
  v_id UUID;
BEGIN
  IF length(v_digits) < 10 THEN
    RAISE EXCEPTION 'Informe o telefone com DDD.';
  END IF;
  IF NOT check_rate_limit('customer_challenge', request_ip(), 10, INTERVAL '15 minutes') THEN
    RAISE EXCEPTION 'Muitas tentativas. Tente de novo em alguns minutos.';
  END IF;
  IF (SELECT COUNT(*) FROM customer_challenges
      WHERE establishment_id = p_establishment_id AND phone = v_digits AND created_at > now() - INTERVAL '24 hours') >= 3 THEN
    RAISE EXCEPTION 'Você já tentou 3 vezes hoje. Tente amanhã, ou use o número de um pedido.';
  END IF;

  SELECT * INTO v_order FROM orders
  WHERE establishment_id = p_establishment_id AND phone_digits(customer_phone) = v_digits
    AND status <> 'cancelled' AND created_at > now() - INTERVAL '365 days'
    AND jsonb_typeof(items) = 'array' AND jsonb_array_length(items) > 0
  ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Item certo: um item do último pedido.
  SELECT array_agg(DISTINCT trim(i->>'product_name')) INTO v_items
  FROM jsonb_array_elements(v_order.items) i WHERE COALESCE(trim(i->>'product_name'), '') <> '';
  v_item := v_items[1 + floor(random() * cardinality(v_items))::int];

  -- 3 itens errados: produtos e combos da loja que não estavam no pedido.
  SELECT array_agg(name) INTO v_decoys FROM (
    SELECT name FROM (
      SELECT DISTINCT trim(name) AS name FROM products WHERE establishment_id = p_establishment_id AND is_active
      UNION
      SELECT DISTINCT trim(name) FROM combos WHERE establishment_id = p_establishment_id AND is_active
    ) n
    WHERE NOT (lower(name) = ANY(SELECT lower(x) FROM unnest(v_items) x))
    ORDER BY random() LIMIT 3
  ) d;
  IF COALESCE(cardinality(v_decoys), 0) < 3 THEN
    RETURN NULL; -- cardápio pequeno demais para perguntar sem entregar a resposta
  END IF;

  -- Valor certo + 3 valores bem diferentes (pelo menos 20% de distância).
  v_totals := ARRAY[round(v_order.total, 2)];
  FOR v_factor IN SELECT f FROM unnest(ARRAY[0.55, 0.7, 1.3, 1.5, 1.8, 2.2]) f ORDER BY random() LOOP
    v_candidate := round(v_order.total * v_factor) - 0.10;
    IF v_candidate >= 5 AND NOT EXISTS (
      SELECT 1 FROM unnest(v_totals) t WHERE abs(t - v_candidate) < GREATEST(t, v_candidate) * 0.2
    ) THEN
      v_totals := v_totals || v_candidate;
    END IF;
    EXIT WHEN cardinality(v_totals) = 4;
  END LOOP;
  IF cardinality(v_totals) < 4 THEN
    RETURN NULL;
  END IF;

  INSERT INTO customer_challenges (establishment_id, phone, item_hash, total_hash)
  VALUES (p_establishment_id, v_digits, hash_secret(lower(v_item)), hash_secret(brl_text(v_order.total)))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'challenge_id', v_id,
    'items', (SELECT jsonb_agg(x ORDER BY random()) FROM unnest(v_decoys || v_item) x),
    'totals', (SELECT jsonb_agg(brl_text(t) ORDER BY random()) FROM unnest(v_totals) t)
  );
END;
$$;

-- Uma tentativa por desafio. Acertou as duas: token de histórico.
-- Errou: devolve NULL (sem RAISE, para a tentativa ficar registrada).
CREATE OR REPLACE FUNCTION answer_customer_challenge(p_challenge_id UUID, p_item TEXT, p_total TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c customer_challenges%ROWTYPE;
  v_token TEXT;
BEGIN
  UPDATE customer_challenges SET used = true
  WHERE id = p_challenge_id AND NOT used AND expires_at > now()
  RETURNING * INTO c;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Essas perguntas expiraram. Comece de novo.';
  END IF;
  IF c.item_hash <> hash_secret(lower(trim(COALESCE(p_item, '')))) OR c.total_hash <> hash_secret(trim(COALESCE(p_total, ''))) THEN
    RETURN NULL;
  END IF;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO customer_tokens (establishment_id, phone, token_hash, scope)
  VALUES (c.establishment_id, c.phone, hash_secret(v_token), 'history');
  RETURN v_token;
END;
$$;

REVOKE EXECUTE ON FUNCTION customer_history_token_valid(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION start_customer_challenge(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION start_customer_challenge(UUID, TEXT) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION answer_customer_challenge(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION answer_customer_challenge(UUID, TEXT, TEXT) TO anon, authenticated;
