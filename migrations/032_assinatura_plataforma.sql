-- ============================================================
-- CatalogAI - Migration 032
-- Assinatura da plataforma: os LOJISTAS pagam a própria plataforma
-- (R$49,90/mês, Pix mensal renovável) — não confundir com a comissão de
-- R$1/pedido da migration 026, que é outra cobrança e continua igual.
--
-- Fica DESATIVADO por padrão (`platform_settings.billing_enabled =
-- false`). Enquanto estiver desligado, todo estabelecimento tem acesso
-- livre, sem prazo nenhum. Quando o dono da plataforma ligar via /admin:
-- - Quem já tinha conta ganha 7 dias a partir da ativação (dado de uma
--   vez só pela rota /api/admin/billing/activate, não por este arquivo).
-- - Quem se cadastra dali pra frente já nasce com 7 dias de teste,
--   sozinho, pelo trigger `set_establishment_trial_on_insert` abaixo.
-- - Passado o prazo sem pagar, o painel bloqueia (nunca o cardápio
--   público) e convida a assinar — ver get_my_subscription_status().
--
-- Deliberadamente NÃO existe um estado 'blocked' armazenado: bloqueio é
-- sempre calculado na hora (comparando trial_ends_at/current_period_end
-- com now()), tanto aqui quanto em lib/subscription.ts (mesma lógica
-- espelhada em TypeScript pro dashboard /admin). Isso evita precisar de
-- um cron só pra "expirar" assinatura, e faz o desbloqueio após o
-- pagamento ser automático por construção — não tem status pra reverter.
-- ============================================================

-- 1. COLUNAS DE ASSINATURA EM establishments
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'trial'
  CHECK (subscription_status IN ('trial', 'active', 'exempt'));
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS subscription_pix_payment_id TEXT;
-- Estabelecimentos já existentes ganham subscription_status='trial' (valor
-- DEFAULT) e trial_ends_at NULL (sem prazo) — 100% livres até a ativação,
-- exatamente o pedido do dono da plataforma.

-- 2. CONFIGURAÇÃO GLOBAL DA PLATAFORMA (linha única)
CREATE TABLE IF NOT EXISTS platform_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true), -- trava de linha única
  billing_enabled BOOLEAN NOT NULL DEFAULT false,
  billing_enabled_at TIMESTAMPTZ,
  monthly_price NUMERIC(10,2) NOT NULL DEFAULT 49.90,
  -- Token da própria aplicação (client_credentials, não é OAuth de
  -- lojista nenhum) — usado só pra cobrar a mensalidade dos lojistas.
  platform_access_token TEXT,
  platform_token_expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO platform_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TRIGGER update_platform_settings_updated_at
  BEFORE UPDATE ON platform_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 3. HISTÓRICO DE COBRANÇAS DA ASSINATURA (separado de `orders`, que é
--    sempre pedido de cliente final).
CREATE TABLE IF NOT EXISTS subscription_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE NOT NULL,
  mercadopago_payment_id TEXT UNIQUE,
  amount NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_payments_establishment ON subscription_payments(establishment_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_mp_id ON subscription_payments(mercadopago_payment_id) WHERE mercadopago_payment_id IS NOT NULL;

CREATE TRIGGER update_subscription_payments_updated_at
  BEFORE UPDATE ON subscription_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 4. RLS: platform_settings e subscription_payments guardam dado
--    sensível/de faturamento — RLS habilitado e SEM NENHUMA POLICY de
--    propósito (mesmo padrão de mercadopago_accounts, migration 026).
--    Só a service role (rotas de servidor: /api/admin/**,
--    /api/subscription/**, webhook) acessa.
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;

-- 5. TRAVA: as 4 colunas de assinatura em establishments só podem ser
--    escritas pela service role. Sem isso, o próprio lojista logado
--    conseguiria se auto-liberar rodando
--    `supabase.from('establishments').update({subscription_status:'active'})`
--    direto no console do navegador (RLS de update de establishments já
--    libera o dono editar a própria loja, ver migration 001).
CREATE OR REPLACE FUNCTION protect_subscription_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    NEW.subscription_status := OLD.subscription_status;
    NEW.trial_ends_at := OLD.trial_ends_at;
    NEW.current_period_end := OLD.current_period_end;
    NEW.subscription_pix_payment_id := OLD.subscription_pix_payment_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_protect_subscription_columns ON establishments;
CREATE TRIGGER trg_protect_subscription_columns
  BEFORE UPDATE ON establishments
  FOR EACH ROW
  EXECUTE FUNCTION protect_subscription_columns();

-- 6. TRIAL AUTOMÁTICO NO CADASTRO: se a cobrança já estiver ligada quando
--    o estabelecimento nasce, já entra com 7 dias de teste. Se estiver
--    desligada, nasce sem prazo — igual todo mundo hoje.
CREATE OR REPLACE FUNCTION set_establishment_trial_on_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_billing_enabled BOOLEAN;
BEGIN
  SELECT billing_enabled INTO v_billing_enabled FROM platform_settings LIMIT 1;
  IF COALESCE(v_billing_enabled, false) THEN
    NEW.trial_ends_at := now() + INTERVAL '7 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_set_establishment_trial_on_insert ON establishments;
CREATE TRIGGER trg_set_establishment_trial_on_insert
  BEFORE INSERT ON establishments
  FOR EACH ROW
  EXECUTE FUNCTION set_establishment_trial_on_insert();

-- 7. RPC PÚBLICA (autenticada): único jeito do painel do lojista saber se
--    deve bloquear — nunca dá acesso direto a platform_settings. Bloqueio
--    é sempre calculado na hora, nunca lido de um campo "blocked" salvo.
DROP FUNCTION IF EXISTS get_my_subscription_status();

CREATE OR REPLACE FUNCTION get_my_subscription_status()
RETURNS TABLE(
  blocked BOOLEAN,
  status TEXT,
  trial_ends_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  monthly_price NUMERIC,
  billing_enabled BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_billing_enabled BOOLEAN;
  v_monthly_price NUMERIC;
  v_status TEXT;
  v_trial_ends_at TIMESTAMPTZ;
  v_current_period_end TIMESTAMPTZ;
  v_blocked BOOLEAN := false;
BEGIN
  SELECT billing_enabled, monthly_price INTO v_billing_enabled, v_monthly_price FROM platform_settings LIMIT 1;

  SELECT e.subscription_status, e.trial_ends_at, e.current_period_end
  INTO v_status, v_trial_ends_at, v_current_period_end
  FROM establishments e
  WHERE e.owner_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF COALESCE(v_billing_enabled, false) AND v_status <> 'exempt' THEN
    IF v_status = 'active' THEN
      v_blocked := v_current_period_end IS NOT NULL AND v_current_period_end < now();
    ELSE
      -- 'trial' (ou qualquer valor futuro desconhecido): só bloqueia se
      -- houver prazo definido e ele já tiver passado — sem prazo = livre.
      v_blocked := v_trial_ends_at IS NOT NULL AND v_trial_ends_at < now();
    END IF;
  END IF;

  RETURN QUERY SELECT v_blocked, v_status, v_trial_ends_at, v_current_period_end, COALESCE(v_monthly_price, 49.90), COALESCE(v_billing_enabled, false);
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_subscription_status() TO authenticated;
