-- ============================================================
-- Freguês - Migration 057: crescimento do SaaS (admin)
--
-- Dados para medir aquisição, ativação, engajamento, retenção, receita,
-- conversão e satisfação, e para a equipe falar com cada lojista:
--  1. platform_team: quem trabalha no crescimento (vê só essa aba).
--  2. growth_leads + growth_lead_notes: todo mundo que começa o cadastro,
--     com WhatsApp, origem e o histórico de contato.
--  3. platform_events: visitas e etapas do cadastro (anônimas).
--  4. owner_activity: dias em que cada lojista usou o painel.
--  5. nps_responses e support_tickets: satisfação e chamados.
--  6. growth_marketing_spend: investimento por mês (para o CAC).
--  7. subscription_events: pagamentos, cancelamentos e checkouts.
--  8. owner_alerts + owner_push_subscriptions: avisos só para o dono.
--  9. growth_store_stats(): números de cada loja num SELECT só.
-- Tudo é lido pelo servidor com a service role; lojista e visitante só
-- escrevem pelas funções abaixo.
-- ============================================================

-- 1. Equipe de crescimento -------------------------------------------
CREATE TABLE IF NOT EXISTS platform_team (
  email TEXT PRIMARY KEY CHECK (email = lower(email)),
  name TEXT,
  role TEXT NOT NULL DEFAULT 'crescimento' CHECK (role IN ('crescimento')),
  added_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE platform_team ENABLE ROW LEVEL SECURITY;

-- 2. Contatos (leads) --------------------------------------------------
CREATE TABLE IF NOT EXISTS growth_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  name TEXT,
  email TEXT,
  whatsapp TEXT,                      -- só dígitos, com DDD (e 55 quando veio assim)
  store_name TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  referrer TEXT,
  landing_path TEXT,
  visitor_id TEXT,
  user_id UUID,
  establishment_id UUID REFERENCES establishments(id) ON DELETE SET NULL,
  crm_status TEXT NOT NULL DEFAULT 'novo'
    CHECK (crm_status IN ('novo', 'contatado', 'sem_resposta', 'interessado', 'convertido', 'perdido')),
  assigned_to TEXT,
  next_follow_up DATE,
  lost_reason TEXT,
  last_contact_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS growth_leads_email_key ON growth_leads (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS growth_leads_establishment_key ON growth_leads (establishment_id) WHERE establishment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_growth_leads_created ON growth_leads (created_at DESC);
ALTER TABLE growth_leads ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS growth_lead_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES growth_leads(id) ON DELETE CASCADE,
  author_email TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'nota' CHECK (kind IN ('whatsapp', 'ligacao', 'email', 'nota')),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_growth_lead_notes_lead ON growth_lead_notes (lead_id, created_at DESC);
ALTER TABLE growth_lead_notes ENABLE ROW LEVEL SECURITY;

-- Só dígitos; número brasileiro sem DDI ganha o 55 (link do WhatsApp).
CREATE OR REPLACE FUNCTION normalize_whatsapp(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN d = '' THEN NULL
    WHEN length(d) IN (10, 11) THEN '55' || d
    ELSE d
  END
  FROM (SELECT regexp_replace(COALESCE(p_value, ''), '\D', '', 'g') AS d) x
$$;

-- Passo 1 do cadastro (nome, WhatsApp, e-mail): grava o contato antes de
-- a conta existir, para a equipe conseguir ajudar quem parou no meio.
CREATE OR REPLACE FUNCTION register_signup_lead(p_payload JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(NULLIF(trim(COALESCE(p_payload->>'email', '')), ''));
  v_whatsapp TEXT := normalize_whatsapp(p_payload->>'whatsapp');
  v_id UUID;
BEGIN
  IF NOT check_rate_limit('signup_lead', request_ip(), 20, INTERVAL '1 hour') THEN
    RETURN NULL;
  END IF;
  IF v_email IS NULL OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'E-mail inválido.';
  END IF;
  IF v_whatsapp IS NULL OR length(v_whatsapp) < 12 OR length(v_whatsapp) > 13 THEN
    RAISE EXCEPTION 'Informe o WhatsApp com DDD.';
  END IF;

  INSERT INTO growth_leads (name, email, whatsapp, store_name, utm_source, utm_medium, utm_campaign, referrer, landing_path, visitor_id)
  VALUES (
    left(NULLIF(trim(COALESCE(p_payload->>'name', '')), ''), 120),
    v_email,
    v_whatsapp,
    left(NULLIF(trim(COALESCE(p_payload->>'store_name', '')), ''), 120),
    left(NULLIF(p_payload->>'utm_source', ''), 80),
    left(NULLIF(p_payload->>'utm_medium', ''), 80),
    left(NULLIF(p_payload->>'utm_campaign', ''), 120),
    left(NULLIF(p_payload->>'referrer', ''), 300),
    left(NULLIF(p_payload->>'landing_path', ''), 300),
    left(NULLIF(p_payload->>'visitor_id', ''), 64)
  )
  ON CONFLICT (lower(email)) WHERE email IS NOT NULL DO UPDATE SET
    name = COALESCE(EXCLUDED.name, growth_leads.name),
    whatsapp = COALESCE(EXCLUDED.whatsapp, growth_leads.whatsapp),
    store_name = COALESCE(EXCLUDED.store_name, growth_leads.store_name),
    utm_source = COALESCE(growth_leads.utm_source, EXCLUDED.utm_source),
    utm_medium = COALESCE(growth_leads.utm_medium, EXCLUDED.utm_medium),
    utm_campaign = COALESCE(growth_leads.utm_campaign, EXCLUDED.utm_campaign),
    referrer = COALESCE(growth_leads.referrer, EXCLUDED.referrer),
    visitor_id = COALESCE(growth_leads.visitor_id, EXCLUDED.visitor_id),
    updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- 3. Eventos (visitas e etapas) ---------------------------------------
CREATE TABLE IF NOT EXISTS platform_events (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  event TEXT NOT NULL,
  visitor_id TEXT,
  path TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  establishment_id UUID REFERENCES establishments(id) ON DELETE SET NULL,
  meta JSONB
);
CREATE INDEX IF NOT EXISTS idx_platform_events_created ON platform_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_events_event_created ON platform_events (event, created_at DESC);
ALTER TABLE platform_events ENABLE ROW LEVEL SECURITY;

-- Visitante anônimo: só os eventos da lista, com limite por IP.
CREATE OR REPLACE FUNCTION track_platform_event(p_event TEXT, p_payload JSONB DEFAULT '{}'::jsonb)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_event NOT IN ('landing_view', 'signup_view', 'signup_step1', 'pricing_view', 'login_view') THEN
    RETURN;
  END IF;
  IF NOT check_rate_limit('track_event', request_ip(), 120, INTERVAL '1 hour') THEN
    RETURN;
  END IF;
  INSERT INTO platform_events (event, visitor_id, path, referrer, utm_source, utm_medium, utm_campaign)
  VALUES (
    p_event,
    left(NULLIF(p_payload->>'visitor_id', ''), 64),
    left(NULLIF(p_payload->>'path', ''), 300),
    left(NULLIF(p_payload->>'referrer', ''), 300),
    left(NULLIF(p_payload->>'utm_source', ''), 80),
    left(NULLIF(p_payload->>'utm_medium', ''), 80),
    left(NULLIF(p_payload->>'utm_campaign', ''), 120)
  );
END;
$$;

-- 4. Uso do painel -----------------------------------------------------
CREATE TABLE IF NOT EXISTS owner_activity (
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  hits INT NOT NULL DEFAULT 1,
  last_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (establishment_id, day)
);
CREATE INDEX IF NOT EXISTS idx_owner_activity_day ON owner_activity (day);
ALTER TABLE owner_activity ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION touch_owner_activity()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_est UUID;
BEGIN
  SELECT id INTO v_est FROM establishments WHERE owner_id = auth.uid() LIMIT 1;
  IF v_est IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO owner_activity (establishment_id, day)
  VALUES (v_est, (now() AT TIME ZONE 'America/Sao_Paulo')::date)
  ON CONFLICT (establishment_id, day) DO UPDATE SET hits = owner_activity.hits + 1, last_at = now();
END;
$$;

-- 5. Satisfação --------------------------------------------------------
CREATE TABLE IF NOT EXISTS nps_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  score INT NOT NULL CHECK (score BETWEEN 0 AND 10),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nps_created ON nps_responses (created_at DESC);
ALTER TABLE nps_responses ENABLE ROW LEVEL SECURITY;

-- Pergunta depois de 14 dias de loja e, depois, a cada 90 dias.
CREATE OR REPLACE FUNCTION nps_due()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM establishments e
    WHERE e.owner_id = auth.uid()
      AND e.created_at <= now() - INTERVAL '14 days'
      AND NOT EXISTS (
        SELECT 1 FROM nps_responses n WHERE n.establishment_id = e.id AND n.created_at > now() - INTERVAL '90 days'
      )
  )
$$;

CREATE OR REPLACE FUNCTION submit_nps(p_score INT, p_comment TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_est UUID;
BEGIN
  SELECT id INTO v_est FROM establishments WHERE owner_id = auth.uid() LIMIT 1;
  IF v_est IS NULL THEN
    RAISE EXCEPTION 'Loja não encontrada.';
  END IF;
  IF p_score IS NULL OR p_score < 0 OR p_score > 10 THEN
    RAISE EXCEPTION 'Nota inválida.';
  END IF;
  IF EXISTS (SELECT 1 FROM nps_responses WHERE establishment_id = v_est AND created_at > now() - INTERVAL '30 days') THEN
    RETURN;
  END IF;
  INSERT INTO nps_responses (establishment_id, score, comment)
  VALUES (v_est, p_score, NULLIF(left(trim(COALESCE(p_comment, '')), 1000), ''));
END;
$$;

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  whatsapp TEXT,
  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'em_andamento', 'resolvido')),
  admin_reply TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created ON support_tickets (created_at DESC);
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "support_tickets_select_owner" ON support_tickets;
CREATE POLICY "support_tickets_select_owner" ON support_tickets
  FOR SELECT USING (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));

CREATE OR REPLACE FUNCTION open_support_ticket(p_subject TEXT, p_message TEXT, p_whatsapp TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_est establishments%ROWTYPE;
  v_id UUID;
BEGIN
  SELECT * INTO v_est FROM establishments WHERE owner_id = auth.uid() LIMIT 1;
  IF v_est.id IS NULL THEN
    RAISE EXCEPTION 'Loja não encontrada.';
  END IF;
  IF COALESCE(trim(p_subject), '') = '' OR COALESCE(trim(p_message), '') = '' THEN
    RAISE EXCEPTION 'Conte o assunto e o que aconteceu.';
  END IF;
  IF (SELECT count(*) FROM support_tickets WHERE establishment_id = v_est.id AND created_at > now() - INTERVAL '1 day') >= 5 THEN
    RAISE EXCEPTION 'Você já abriu 5 chamados hoje. Nossa equipe vai responder em breve.';
  END IF;
  INSERT INTO support_tickets (establishment_id, subject, message, whatsapp)
  VALUES (v_est.id, left(trim(p_subject), 120), left(trim(p_message), 3000),
          COALESCE(normalize_whatsapp(p_whatsapp), normalize_whatsapp(v_est.whatsapp_number)))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- 6. Investimento em marketing ------------------------------------------
CREATE TABLE IF NOT EXISTS growth_marketing_spend (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month DATE NOT NULL,                 -- primeiro dia do mês
  channel TEXT NOT NULL DEFAULT 'geral',
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  note TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE growth_marketing_spend ENABLE ROW LEVEL SECURITY;

-- 7. Assinaturas ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE,
  event TEXT NOT NULL CHECK (event IN ('checkout_started', 'paid', 'canceled', 'payment_failed')),
  plan_tier TEXT,
  amount NUMERIC(12,2),
  external_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_events_external_key ON subscription_events (event, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscription_events_created ON subscription_events (created_at DESC);
ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;

-- 8. Avisos ao dono -------------------------------------------------------
CREATE TABLE IF NOT EXISTS owner_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  url TEXT,
  dedupe_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_owner_alerts_pending ON owner_alerts (created_at) WHERE sent_at IS NULL;
ALTER TABLE owner_alerts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS owner_push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_ok_at TIMESTAMPTZ
);
ALTER TABLE owner_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION add_owner_alert(p_kind TEXT, p_title TEXT, p_body TEXT, p_url TEXT, p_dedupe TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO owner_alerts (kind, title, body, url, dedupe_key)
  VALUES (p_kind, left(p_title, 120), left(p_body, 400), p_url, p_dedupe)
  ON CONFLICT (dedupe_key) DO NOTHING;
END;
$$;

-- Novo contato no passo 1 do cadastro.
CREATE OR REPLACE FUNCTION growth_lead_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.establishment_id IS NULL THEN
    PERFORM add_owner_alert('lead', 'Novo cadastro iniciado',
      COALESCE(NEW.name, 'Sem nome') || ' · WhatsApp ' || COALESCE(NEW.whatsapp, '-') ||
      CASE WHEN NEW.utm_source IS NOT NULL THEN ' · via ' || NEW.utm_source ELSE '' END,
      '/admin/crescimento?lead=' || NEW.id, 'lead:' || NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_growth_lead_alert ON growth_leads;
CREATE TRIGGER trg_growth_lead_alert AFTER INSERT ON growth_leads FOR EACH ROW EXECUTE FUNCTION growth_lead_alert();

-- Loja criada: liga ao contato do cadastro (pelo e-mail) ou cria um
-- contato com o WhatsApp da loja, e avisa o dono.
CREATE OR REPLACE FUNCTION growth_establishment_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_name TEXT;
  v_lead UUID;
BEGIN
  SELECT lower(u.email), to_jsonb(u) -> 'raw_user_meta_data' ->> 'name'
  INTO v_email, v_name
  FROM auth.users u WHERE u.id = NEW.owner_id;

  IF v_email IS NOT NULL THEN
    UPDATE growth_leads SET
      establishment_id = NEW.id,
      user_id = NEW.owner_id,
      store_name = COALESCE(store_name, NEW.name),
      whatsapp = COALESCE(whatsapp, normalize_whatsapp(NEW.whatsapp_number)),
      updated_at = now()
    WHERE lower(email) = v_email AND establishment_id IS NULL
    RETURNING id INTO v_lead;
  END IF;

  IF v_lead IS NULL THEN
    INSERT INTO growth_leads (name, email, whatsapp, store_name, user_id, establishment_id)
    VALUES (v_name, v_email, normalize_whatsapp(NEW.whatsapp_number), NEW.name, NEW.owner_id, NEW.id)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_lead;
  END IF;

  PERFORM add_owner_alert('loja', 'Nova loja criada: ' || NEW.name,
    'WhatsApp ' || COALESCE(normalize_whatsapp(NEW.whatsapp_number), '-') || COALESCE(' · ' || v_email, ''),
    '/admin/crescimento' || COALESCE('?lead=' || v_lead, ''), 'loja:' || NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_growth_establishment_created ON establishments;
CREATE TRIGGER trg_growth_establishment_created AFTER INSERT ON establishments FOR EACH ROW EXECUTE FUNCTION growth_establishment_created();

-- Primeiro pedido de uma loja (momento de valor).
CREATE OR REPLACE FUNCTION growth_first_order_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM orders WHERE establishment_id = NEW.establishment_id AND id <> NEW.id) THEN
    SELECT name INTO v_name FROM establishments WHERE id = NEW.establishment_id;
    PERFORM add_owner_alert('primeiro_pedido', COALESCE(v_name, 'Uma loja') || ' recebeu o 1º pedido',
      'Valor ' || to_char(NEW.total, 'FM999G990D00'), '/admin/crescimento', 'primeiro_pedido:' || NEW.establishment_id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_growth_first_order_alert ON orders;
CREATE TRIGGER trg_growth_first_order_alert AFTER INSERT ON orders FOR EACH ROW EXECUTE FUNCTION growth_first_order_alert();

CREATE OR REPLACE FUNCTION growth_ticket_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT;
BEGIN
  SELECT name INTO v_name FROM establishments WHERE id = NEW.establishment_id;
  PERFORM add_owner_alert('suporte', 'Chamado de ' || COALESCE(v_name, 'uma loja') || ': ' || NEW.subject,
    left(NEW.message, 200), '/admin/crescimento?aba=suporte', 'suporte:' || NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_growth_ticket_alert ON support_tickets;
CREATE TRIGGER trg_growth_ticket_alert AFTER INSERT ON support_tickets FOR EACH ROW EXECUTE FUNCTION growth_ticket_alert();

CREATE OR REPLACE FUNCTION growth_nps_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT;
BEGIN
  IF NEW.score <= 6 THEN
    SELECT name INTO v_name FROM establishments WHERE id = NEW.establishment_id;
    PERFORM add_owner_alert('nps', COALESCE(v_name, 'Uma loja') || ' deu nota ' || NEW.score || ' para o Freguês',
      COALESCE(NEW.comment, 'Sem comentário.'), '/admin/crescimento?aba=satisfacao', 'nps:' || NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_growth_nps_alert ON nps_responses;
CREATE TRIGGER trg_growth_nps_alert AFTER INSERT ON nps_responses FOR EACH ROW EXECUTE FUNCTION growth_nps_alert();

CREATE OR REPLACE FUNCTION growth_subscription_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT;
BEGIN
  IF NEW.event NOT IN ('paid', 'canceled', 'payment_failed') THEN
    RETURN NEW;
  END IF;
  SELECT name INTO v_name FROM establishments WHERE id = NEW.establishment_id;
  PERFORM add_owner_alert('assinatura',
    CASE NEW.event
      WHEN 'paid' THEN COALESCE(v_name, 'Uma loja') || ' pagou o plano ' || COALESCE(NEW.plan_tier, '')
      WHEN 'canceled' THEN COALESCE(v_name, 'Uma loja') || ' cancelou a assinatura'
      ELSE 'Pagamento recusado: ' || COALESCE(v_name, 'uma loja')
    END,
    CASE WHEN NEW.amount IS NOT NULL THEN 'Valor ' || to_char(NEW.amount, 'FM999G990D00') ELSE NULL END,
    '/admin/crescimento', 'assinatura:' || NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_growth_subscription_alert ON subscription_events;
CREATE TRIGGER trg_growth_subscription_alert AFTER INSERT ON subscription_events FOR EACH ROW EXECUTE FUNCTION growth_subscription_alert();

-- Erro crítico: no máximo um aviso por área a cada hora.
CREATE OR REPLACE FUNCTION growth_error_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.level = 'critical' THEN
    PERFORM add_owner_alert('erro', 'Erro crítico: ' || NEW.scope, left(NEW.message, 200), '/admin/logs',
      'erro:' || NEW.scope || ':' || to_char(now(), 'YYYYMMDDHH24'));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_growth_error_alert ON error_logs;
CREATE TRIGGER trg_growth_error_alert AFTER INSERT ON error_logs FOR EACH ROW EXECUTE FUNCTION growth_error_alert();

-- 9. Números por loja (um SELECT para o painel de crescimento) ------------
CREATE OR REPLACE FUNCTION growth_store_stats()
RETURNS TABLE (
  establishment_id UUID,
  products_count INT,
  orders_total INT,
  orders_30d INT,
  sales_30d NUMERIC,
  first_order_at TIMESTAMPTZ,
  last_order_at TIMESTAMPTZ,
  last_activity_day DATE,
  active_days_30d INT,
  push_devices INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id,
    (SELECT count(*)::int FROM products p WHERE p.establishment_id = e.id AND p.is_active),
    (SELECT count(*)::int FROM orders o WHERE o.establishment_id = e.id),
    (SELECT count(*)::int FROM orders o WHERE o.establishment_id = e.id AND o.created_at > now() - INTERVAL '30 days' AND o.status <> 'cancelled'),
    (SELECT COALESCE(sum(o.total), 0) FROM orders o WHERE o.establishment_id = e.id AND o.created_at > now() - INTERVAL '30 days'
       AND o.status IN ('confirmed', 'preparing', 'completed')),
    (SELECT min(o.created_at) FROM orders o WHERE o.establishment_id = e.id),
    (SELECT max(o.created_at) FROM orders o WHERE o.establishment_id = e.id),
    (SELECT max(a.day) FROM owner_activity a WHERE a.establishment_id = e.id),
    (SELECT count(*)::int FROM owner_activity a WHERE a.establishment_id = e.id AND a.day > (now() - INTERVAL '30 days')::date),
    (SELECT count(*)::int FROM customer_devices d WHERE d.establishment_id = e.id)
  FROM establishments e
$$;

-- Atividade por loja e por mês (coortes de retenção): pedidos e dias de
-- uso do painel nos últimos 7 meses.
CREATE OR REPLACE FUNCTION growth_store_months()
RETURNS TABLE (establishment_id UUID, month DATE, orders INT, active_days INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH o AS (
    SELECT establishment_id, date_trunc('month', created_at AT TIME ZONE 'America/Sao_Paulo')::date AS month, count(*)::int AS orders
    FROM orders
    WHERE created_at > date_trunc('month', now()) - INTERVAL '7 months' AND status <> 'cancelled'
    GROUP BY 1, 2
  ), a AS (
    SELECT establishment_id, date_trunc('month', day)::date AS month, count(*)::int AS active_days
    FROM owner_activity
    WHERE day > (date_trunc('month', now()) - INTERVAL '7 months')::date
    GROUP BY 1, 2
  )
  SELECT COALESCE(o.establishment_id, a.establishment_id), COALESCE(o.month, a.month), COALESCE(o.orders, 0), COALESCE(a.active_days, 0)
  FROM o FULL JOIN a ON a.establishment_id = o.establishment_id AND a.month = o.month
$$;

-- Funções de leitura/admin: só a service role.
REVOKE EXECUTE ON FUNCTION growth_store_months() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION growth_store_months() TO service_role;
REVOKE EXECUTE ON FUNCTION growth_store_stats() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION add_owner_alert(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION growth_lead_alert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION growth_establishment_created() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION growth_first_order_alert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION growth_ticket_alert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION growth_nps_alert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION growth_subscription_alert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION growth_error_alert() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION growth_store_stats() TO service_role;
GRANT EXECUTE ON FUNCTION add_owner_alert(TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- Funções públicas: visitante (cadastro/visitas) e lojista logado.
REVOKE EXECUTE ON FUNCTION register_signup_lead(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION register_signup_lead(JSONB) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION track_platform_event(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION track_platform_event(TEXT, JSONB) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION touch_owner_activity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION touch_owner_activity() TO authenticated;
REVOKE EXECUTE ON FUNCTION nps_due() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION nps_due() TO authenticated;
REVOKE EXECUTE ON FUNCTION submit_nps(INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION submit_nps(INT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION open_support_ticket(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION open_support_ticket(TEXT, TEXT, TEXT) TO authenticated;

-- Lojas que já existiam entram como contatos (com o WhatsApp da loja).
INSERT INTO growth_leads (name, email, whatsapp, store_name, user_id, establishment_id, created_at, crm_status)
SELECT to_jsonb(u) -> 'raw_user_meta_data' ->> 'name', lower(u.email), normalize_whatsapp(e.whatsapp_number), e.name,
       e.owner_id, e.id, e.created_at,
       CASE WHEN e.subscription_status = 'active' THEN 'convertido' ELSE 'novo' END
FROM establishments e
LEFT JOIN auth.users u ON u.id = e.owner_id
WHERE NOT EXISTS (SELECT 1 FROM growth_leads l WHERE l.establishment_id = e.id)
ON CONFLICT DO NOTHING;
