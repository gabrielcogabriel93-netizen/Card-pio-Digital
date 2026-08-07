-- ============================================================
-- CatalogAI - Migration 035
-- Rate limiting nas funções públicas de consulta por telefone
-- (get_orders_by_phone, migration 012; get_customer_profile, migration
-- 016, com o retorno alterado depois pela 018 — ver comentário mais
-- abaixo) — hoje sem NENHUM limite próprio, só o insert de pedido tinha
-- (006_order_rate_limit.sql). O comentário da 012 já documentava esse
-- trade-off como aceito ("quem souber o telefone de outra pessoa e o
-- slug da loja consegue ver o histórico") — isso continua verdade, mas
-- sem limite nenhum, dava pra automatizar milhares de tentativas de
-- telefone por minuto contra uma loja. Aqui não resolve o trade-off de
-- design (fora de escopo mudar o modelo sem senha), só torna a
-- enumeração automatizada impraticável na prática.
--
-- Mesma filosofia de 006_order_rate_limit.sql: reforçado no BANCO (não
-- no app), então vale mesmo pra quem chama a API do Supabase direto,
-- pulando o app inteiro. Limite por ESTABELECIMENTO (não por IP — a
-- função não recebe o IP de quem chamou) — é o que já protege o alvo
-- real (enumerar telefones contra UMA loja) sem depender de dado que a
-- função não tem acesso.
-- ============================================================

CREATE TABLE IF NOT EXISTS rate_limit_hits (
  id BIGSERIAL PRIMARY KEY,
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_hits_lookup ON rate_limit_hits(scope, key, created_at);

ALTER TABLE rate_limit_hits ENABLE ROW LEVEL SECURITY;
-- Sem policy nenhuma de propósito — só as funções SECURITY DEFINER abaixo
-- escrevem/leem aqui, igual mercadopago_accounts (migration 026).

-- Registra uma tentativa e devolve FALSE quando o limite da janela já foi
-- atingido (chamador decide o que fazer — aqui sempre RAISE EXCEPTION).
-- Aproveita a mesma escrita pra apagar hits velhos do mesmo scope, então
-- a tabela nunca cresce sem limite sem precisar de um job de limpeza à parte.
CREATE OR REPLACE FUNCTION check_rate_limit(p_scope TEXT, p_key TEXT, p_max_count INT, p_window INTERVAL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  DELETE FROM rate_limit_hits WHERE scope = p_scope AND created_at < now() - INTERVAL '1 hour';

  SELECT COUNT(*) INTO v_count FROM rate_limit_hits
  WHERE scope = p_scope AND key = p_key AND created_at > now() - p_window;

  IF v_count >= p_max_count THEN
    RETURN FALSE;
  END IF;

  INSERT INTO rate_limit_hits (scope, key) VALUES (p_scope, p_key);
  RETURN TRUE;
END;
$$;

-- get_orders_by_phone (012_historico_pedidos_cliente.sql): mesmo
-- RETURNS TABLE de antes, CREATE OR REPLACE simples.
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

  IF NOT check_rate_limit('get_orders_by_phone', p_establishment_id::text, 60, INTERVAL '1 minute') THEN
    RAISE EXCEPTION 'Muitas consultas em pouco tempo. Aguarde um instante e tente novamente.';
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

-- get_customer_profile: a versão "de antes" NÃO é a da 016 — a 018
-- (aniversário) já tinha acrescentado birth_date ao RETURNS TABLE, com
-- DROP FUNCTION antes (Postgres não deixa mudar OUT params com só
-- CREATE OR REPLACE). Reproduz esse mesmo formato aqui, só com o rate
-- limit a mais — copiar da 016 (sem birth_date) quebra a migration com
-- "cannot change return type of existing function".
DROP FUNCTION IF EXISTS get_customer_profile(UUID, TEXT);

CREATE OR REPLACE FUNCTION get_customer_profile(p_establishment_id UUID, p_phone TEXT)
RETURNS TABLE(customer_id UUID, name TEXT, birth_date DATE, addresses JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id UUID;
  v_name TEXT;
  v_birth_date DATE;
BEGIN
  IF NOT check_rate_limit('get_customer_profile', p_establishment_id::text, 60, INTERVAL '1 minute') THEN
    RAISE EXCEPTION 'Muitas consultas em pouco tempo. Aguarde um instante e tente novamente.';
  END IF;

  SELECT id, c.name, c.birth_date INTO v_customer_id, v_name, v_birth_date
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
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', a.id,
            'label', a.label,
            'street', a.street,
            'number', a.number,
            'neighborhood', a.neighborhood,
            'complement', a.complement,
            'reference', a.reference,
            'zip_code', a.zip_code
          ) ORDER BY a.updated_at DESC
        )
        FROM customer_addresses a
        WHERE a.customer_id = v_customer_id
      ),
      '[]'::jsonb
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_customer_profile(UUID, TEXT) TO anon, authenticated;
