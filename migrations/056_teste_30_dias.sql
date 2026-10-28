-- ============================================================
-- Freguês - Migration 056: teste grátis de 30 dias (era 7)
--
-- 1. Quem se cadastrar com a cobrança ligada nasce com 30 dias de teste.
-- 2. Quem está em teste agora passa a ter 30 dias contados do cadastro.
--    Só aumenta: ninguém perde dias (GREATEST com o prazo atual).
-- ============================================================

CREATE OR REPLACE FUNCTION set_establishment_trial_on_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_billing_enabled BOOLEAN;
BEGIN
  SELECT billing_enabled INTO v_billing_enabled FROM platform_settings LIMIT 1;
  IF COALESCE(v_billing_enabled, false) THEN
    NEW.trial_ends_at := now() + INTERVAL '30 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- A trava protect_subscription_columns só deixa a service role mexer no
-- prazo; no editor SQL não há papel, então ele é informado aqui.
SELECT set_config('request.jwt.claim.role', 'service_role', false);

UPDATE establishments
SET trial_ends_at = GREATEST(trial_ends_at, created_at + INTERVAL '30 days')
WHERE subscription_status = 'trial'
  AND trial_ends_at IS NOT NULL
  AND trial_ends_at < created_at + INTERVAL '30 days';

SELECT set_config('request.jwt.claim.role', '', false);
