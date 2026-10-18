-- ============================================================
-- Migration 049 -- app da loja e notificações no lugar do WhatsApp
-- (pode rodar a qualquer momento; o app antigo não usa nada daqui).
--
-- 1. customer_devices: cada aparelho que instalou o app da loja ou
--    ativou notificações. Liga ao cliente (telefone) só quando o aparelho
--    prova que é dele (token do cliente, migration 045).
-- 2. push_campaigns: mensagens que a loja manda para os clientes, com
--    entregues, falhas e cliques.
-- 3. marketing_suggestions: a sugestão de divulgação do dia.
-- 4. verify_customer_by_order: confirma um aparelho novo pelo número de
--    um pedido anterior (substitui o código pelo WhatsApp).
-- ============================================================

-- 1. APARELHOS ------------------------------------------------
-- device_key: identificador aleatório que o próprio aparelho gera e guarda
-- (existe antes de o cliente aceitar notificações, para contar instalações).
-- endpoint/p256dh/auth: endereço de envio, só depois que ele ativa os avisos.
CREATE TABLE IF NOT EXISTS customer_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE NOT NULL,
  device_key TEXT NOT NULL,
  endpoint TEXT,
  p256dh TEXT,
  auth TEXT,
  customer_phone TEXT,               -- só dígitos; NULL até o aparelho provar que é do cliente
  customer_name TEXT,
  platform TEXT,                     -- ios | android | desktop
  installed BOOLEAN NOT NULL DEFAULT false,
  notifications_enabled BOOLEAN NOT NULL DEFAULT false,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (establishment_id, device_key)
);
CREATE INDEX IF NOT EXISTS idx_customer_devices_est ON customer_devices(establishment_id, notifications_enabled);
CREATE INDEX IF NOT EXISTS idx_customer_devices_phone ON customer_devices(establishment_id, customer_phone);

ALTER TABLE customer_devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customer_devices_select_owner" ON customer_devices;
CREATE POLICY "customer_devices_select_owner" ON customer_devices
  FOR SELECT USING (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));
REVOKE ALL ON customer_devices FROM anon;

-- Registro feito pelo navegador do cliente. A device_key só o próprio
-- aparelho conhece.
CREATE OR REPLACE FUNCTION register_customer_device(
  p_establishment_id UUID,
  p_device_key TEXT,
  p_endpoint TEXT,
  p_p256dh TEXT,
  p_auth TEXT,
  p_installed BOOLEAN,
  p_platform TEXT,
  p_phone TEXT DEFAULT NULL,
  p_token TEXT DEFAULT NULL,
  p_name TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits TEXT := phone_digits(p_phone);
  v_linked TEXT;
  v_has_push BOOLEAN;
BEGIN
  IF p_device_key IS NULL OR length(p_device_key) < 20 OR length(p_device_key) > 100 THEN
    RAISE EXCEPTION 'Aparelho inválido.';
  END IF;
  IF p_endpoint IS NOT NULL AND (length(p_endpoint) > 1000 OR left(p_endpoint, 8) <> 'https://') THEN
    RAISE EXCEPTION 'Aparelho inválido.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM establishments WHERE id = p_establishment_id) THEN
    RAISE EXCEPTION 'Loja não encontrada.';
  END IF;
  IF NOT check_rate_limit('customer_device', request_ip(), 30, INTERVAL '10 minutes') THEN
    RAISE EXCEPTION 'Muitas tentativas. Tente de novo em alguns minutos.';
  END IF;

  v_has_push := p_endpoint IS NOT NULL AND NULLIF(p_p256dh, '') IS NOT NULL AND NULLIF(p_auth, '') IS NOT NULL;

  -- Só liga ao telefone com o token do cliente (prova de que é dele).
  IF length(v_digits) >= 10 AND customer_token_valid(p_establishment_id, v_digits, p_token) THEN
    v_linked := v_digits;
  END IF;

  INSERT INTO customer_devices (establishment_id, device_key, endpoint, p256dh, auth, customer_phone, customer_name,
                                platform, installed, notifications_enabled, user_agent)
  VALUES (p_establishment_id, p_device_key,
          CASE WHEN v_has_push THEN p_endpoint END,
          CASE WHEN v_has_push THEN p_p256dh END,
          CASE WHEN v_has_push THEN p_auth END,
          v_linked,
          CASE WHEN v_linked IS NOT NULL THEN left(trim(p_name), 80) END,
          left(p_platform, 20), COALESCE(p_installed, false), v_has_push,
          left(current_setting('request.headers', true)::json->>'user-agent', 300))
  ON CONFLICT (establishment_id, device_key) DO UPDATE SET
    endpoint = CASE WHEN v_has_push THEN EXCLUDED.endpoint ELSE customer_devices.endpoint END,
    p256dh = CASE WHEN v_has_push THEN EXCLUDED.p256dh ELSE customer_devices.p256dh END,
    auth = CASE WHEN v_has_push THEN EXCLUDED.auth ELSE customer_devices.auth END,
    notifications_enabled = customer_devices.notifications_enabled OR v_has_push,
    customer_phone = COALESCE(EXCLUDED.customer_phone, customer_devices.customer_phone),
    customer_name = COALESCE(EXCLUDED.customer_name, customer_devices.customer_name),
    platform = COALESCE(EXCLUDED.platform, customer_devices.platform),
    installed = customer_devices.installed OR EXCLUDED.installed,
    last_seen_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION unregister_customer_device(p_establishment_id UUID, p_device_key TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE customer_devices SET notifications_enabled = false, endpoint = NULL, p256dh = NULL, auth = NULL
  WHERE establishment_id = p_establishment_id AND device_key = p_device_key;
$$;

-- 2. CAMPANHAS ------------------------------------------------
CREATE TABLE IF NOT EXISTS push_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  image_url TEXT,
  url TEXT,
  audience TEXT NOT NULL,            -- all | inactive | birthday | recent | customer
  audience_value TEXT,
  source TEXT NOT NULL DEFAULT 'manual', -- manual | sugestao | aniversario | carrinho | sumido
  target_count INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  click_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_campaigns_est ON push_campaigns(establishment_id, created_at DESC);
ALTER TABLE push_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "push_campaigns_select_owner" ON push_campaigns;
CREATE POLICY "push_campaigns_select_owner" ON push_campaigns
  FOR SELECT USING (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));

-- Clique na notificação. Chamado só pelo servidor (/api/push/click), que
-- aplica o limite pelo IP do cliente antes (aqui o IP seria o do servidor).
CREATE OR REPLACE FUNCTION register_push_click(p_campaign_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE push_campaigns SET click_count = click_count + 1 WHERE id = p_campaign_id;
$$;

-- 3. SUGESTÃO DO DIA -----------------------------------------
CREATE TABLE IF NOT EXISTS marketing_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE NOT NULL,
  day DATE NOT NULL,
  product_ids UUID[] NOT NULL DEFAULT '{}',
  headline TEXT NOT NULL,
  subline TEXT,
  caption TEXT NOT NULL,
  hashtags TEXT[] NOT NULL DEFAULT '{}',
  push_title TEXT NOT NULL,
  push_body TEXT NOT NULL,
  provider TEXT NOT NULL,            -- claude | gemini | fregues
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_marketing_suggestions_est_day ON marketing_suggestions(establishment_id, day DESC);
ALTER TABLE marketing_suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "marketing_suggestions_select_owner" ON marketing_suggestions;
CREATE POLICY "marketing_suggestions_select_owner" ON marketing_suggestions
  FOR SELECT USING (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));

-- 4. CONFIRMAR APARELHO PELO NÚMERO DO PEDIDO -----------------
-- O número (#A1B2C3) aparece na página do pedido e nas notificações.
-- Com ele o aparelho novo recebe o token e vê endereços e pontos.
CREATE OR REPLACE FUNCTION verify_customer_by_order(p_establishment_id UUID, p_phone TEXT, p_order_code TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits TEXT := phone_digits(p_phone);
  v_code TEXT := lower(regexp_replace(COALESCE(p_order_code, ''), '[^0-9a-fA-F]', '', 'g'));
BEGIN
  IF length(v_digits) < 10 OR length(v_code) < 6 THEN
    RAISE EXCEPTION 'Informe o telefone e o número do pedido (6 letras e números).';
  END IF;
  IF NOT check_rate_limit('verify_by_order', request_ip(), 8, INTERVAL '15 minutes')
     OR NOT check_rate_limit('verify_by_order_phone', p_establishment_id::text || ':' || v_digits, 5, INTERVAL '15 minutes') THEN
    RAISE EXCEPTION 'Muitas tentativas. Tente de novo em alguns minutos.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM orders
    WHERE establishment_id = p_establishment_id
      AND phone_digits(customer_phone) = v_digits
      AND replace(id::text, '-', '') LIKE v_code || '%'
      AND created_at > now() - INTERVAL '365 days'
  ) THEN
    -- Devolve NULL em vez de erro: um RAISE desfaria o registro da
    -- tentativa e o limite acima nunca seria atingido.
    RETURN NULL;
  END IF;
  RETURN issue_customer_token(p_establishment_id, v_digits);
END;
$$;

-- PERMISSÕES --------------------------------------------------
REVOKE EXECUTE ON FUNCTION register_customer_device(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION register_customer_device(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION unregister_customer_device(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION unregister_customer_device(UUID, TEXT) TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION register_push_click(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION register_push_click(UUID) TO service_role;
REVOKE EXECUTE ON FUNCTION verify_customer_by_order(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION verify_customer_by_order(UUID, TEXT, TEXT) TO anon, authenticated, service_role;
