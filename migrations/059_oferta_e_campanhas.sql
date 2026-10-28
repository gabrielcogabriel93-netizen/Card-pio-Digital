-- ============================================================
-- Freguês - Migration 059: oferta configurável e campanhas com link
--
-- 1. platform_settings.trial_enabled / trial_days: o dono liga ou desliga
--    o teste grátis do site e escolhe o prazo no admin. Desligado = a
--    loja nasce já precisando assinar.
-- 2. signup_campaigns: campanhas com link próprio (/p/codigo), cada uma
--    com prazo grátis (0 = cobra desde o início), desconto opcional em %
--    por N meses (aplicado no checkout do Stripe) e período de validade.
-- 3. establishments.signup_campaign: por qual campanha a loja entrou.
-- 4. A criação da loja passa a decidir sozinha o prazo e o status: antes
--    só o UPDATE era protegido, e um INSERT feito pelo navegador podia
--    nascer com subscription_status 'exempt' ou 'active'.
-- 5. get_signup_offer(código): o que o site, o cadastro e o login
--    mostram ("Testar 30 dias grátis", "Criar minha loja", desconto).
-- ============================================================

ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS trial_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS trial_days INT NOT NULL DEFAULT 30;
DO $$ BEGIN
  ALTER TABLE platform_settings ADD CONSTRAINT platform_settings_trial_days_check CHECK (trial_days BETWEEN 1 AND 365);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS signup_campaigns (
  code TEXT PRIMARY KEY CHECK (code ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  name TEXT NOT NULL,
  trial_days INT NOT NULL DEFAULT 0 CHECK (trial_days BETWEEN 0 AND 365),
  discount_percent INT NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 90),
  discount_months INT NOT NULL DEFAULT 0 CHECK (discount_months BETWEEN 0 AND 24),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
ALTER TABLE signup_campaigns ENABLE ROW LEVEL SECURITY;

ALTER TABLE establishments ADD COLUMN IF NOT EXISTS signup_campaign TEXT;

-- Campanha valendo agora (ativa e dentro do período).
CREATE OR REPLACE FUNCTION active_signup_campaign(p_code TEXT)
RETURNS signup_campaigns
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM signup_campaigns
  WHERE code = lower(trim(COALESCE(p_code, '')))
    AND is_active
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at > now())
$$;

-- Oferta que a pessoa vê no site/cadastro (visitante anônimo).
CREATE OR REPLACE FUNCTION get_signup_offer(p_campaign TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s platform_settings%ROWTYPE;
  c signup_campaigns%ROWTYPE;
BEGIN
  SELECT * INTO s FROM platform_settings LIMIT 1;
  IF NULLIF(trim(COALESCE(p_campaign, '')), '') IS NOT NULL THEN
    c := active_signup_campaign(p_campaign);
  END IF;
  IF c.code IS NOT NULL THEN
    RETURN jsonb_build_object(
      'trial_days', c.trial_days, 'campaign_code', c.code, 'campaign_name', c.name,
      'discount_percent', c.discount_percent, 'discount_months', c.discount_months,
      'campaign_ends_at', c.ends_at);
  END IF;
  RETURN jsonb_build_object(
    'trial_days', CASE WHEN COALESCE(s.trial_enabled, true) THEN COALESCE(s.trial_days, 30) ELSE 0 END,
    'campaign_code', NULL, 'campaign_name', NULL, 'discount_percent', 0, 'discount_months', 0, 'campaign_ends_at', NULL);
END;
$$;

-- Criação da loja: prazo e status decididos aqui, nunca pelo navegador.
CREATE OR REPLACE FUNCTION set_establishment_trial_on_insert()
RETURNS TRIGGER AS $$
DECLARE
  s platform_settings%ROWTYPE;
  c signup_campaigns%ROWTYPE;
BEGIN
  SELECT * INTO s FROM platform_settings LIMIT 1;

  IF NEW.signup_campaign IS NOT NULL THEN
    c := active_signup_campaign(NEW.signup_campaign);
    NEW.signup_campaign := c.code; -- código inválido/vencido vira NULL
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    NEW.subscription_status := 'trial';
    NEW.current_period_end := NULL;
    NEW.plan_tier := 'essencial';
    NEW.trial_ends_at := NULL;
  END IF;

  IF COALESCE(s.billing_enabled, false) AND NEW.subscription_status = 'trial' THEN
    IF c.code IS NOT NULL THEN
      NEW.trial_ends_at := now() + make_interval(days => c.trial_days);
    ELSIF COALESCE(s.trial_enabled, true) THEN
      NEW.trial_ends_at := now() + make_interval(days => COALESCE(s.trial_days, 30));
    ELSE
      NEW.trial_ends_at := now(); -- sem teste: já pede o plano
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- A campanha de origem não muda depois (é ela que dá o desconto).
CREATE OR REPLACE FUNCTION protect_signup_campaign()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    NEW.signup_campaign := OLD.signup_campaign;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP TRIGGER IF EXISTS trg_protect_signup_campaign ON establishments;
CREATE TRIGGER trg_protect_signup_campaign BEFORE UPDATE ON establishments FOR EACH ROW EXECUTE FUNCTION protect_signup_campaign();

-- Campanha e desconto da própria loja (página Planos).
CREATE OR REPLACE FUNCTION get_my_signup_campaign()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN c.code IS NULL THEN NULL ELSE jsonb_build_object(
    'code', c.code, 'name', c.name, 'discount_percent', c.discount_percent, 'discount_months', c.discount_months) END
  FROM establishments e
  LEFT JOIN signup_campaigns c ON c.code = e.signup_campaign
  WHERE e.owner_id = auth.uid()
  LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION active_signup_campaign(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION active_signup_campaign(TEXT) TO service_role;
REVOKE EXECUTE ON FUNCTION get_signup_offer(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_signup_offer(TEXT) TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION get_my_signup_campaign() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_my_signup_campaign() TO authenticated;
