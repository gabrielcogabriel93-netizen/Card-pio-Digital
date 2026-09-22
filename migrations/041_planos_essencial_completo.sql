-- ============================================================
-- CatalogAI - Migration 041
-- Separa o plano único em dois: "Essencial" (R$49,90) e "Completo"
-- (R$97,00, preço mantido em código -- ver lib/plans.ts). O Completo
-- adiciona: controle de estoque, balcão/PDV, programa de fidelidade,
-- cupons de desconto, Pix automático, cardápio de mesa com QR Code e
-- relatórios financeiros (/painel/relatorios). Tudo o mais (cardápio
-- digital, pedidos por WhatsApp, entrega/retirada, perfil da loja,
-- link personalizado, PWA, combos) continua no Essencial.
--
-- GRANDFATHERING: o DEFAULT 'completo' do ALTER TABLE abaixo aplica
-- 'completo' a toda linha JÁ EXISTENTE na hora da migration (as 53
-- lojas atuais) -- sem tocar em subscription_status/current_period_end
-- nem em preço de quem já paga. Logo depois trocamos o DEFAULT pra
-- 'essencial', então toda loja cadastrada a partir daqui já nasce
-- essencial, sem precisar mudar o fluxo de cadastro.
-- ============================================================

ALTER TABLE establishments ADD COLUMN plan_tier TEXT NOT NULL DEFAULT 'completo'
  CHECK (plan_tier IN ('essencial', 'completo'));
ALTER TABLE establishments ALTER COLUMN plan_tier SET DEFAULT 'essencial';

-- ============================================================
-- Trava plan_tier igual as outras colunas de assinatura (mesmo
-- trigger da migration 032) -- só o service role (webhook do Stripe,
-- rotas /api/admin/**) pode mudar o plano; o dono da loja não pode só
-- fazendo update direto na própria linha.
-- ============================================================
CREATE OR REPLACE FUNCTION protect_subscription_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    NEW.subscription_status := OLD.subscription_status;
    NEW.trial_ends_at := OLD.trial_ends_at;
    NEW.current_period_end := OLD.current_period_end;
    NEW.subscription_pix_payment_id := OLD.subscription_pix_payment_id;
    NEW.plan_tier := OLD.plan_tier;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- Função central de acesso ao plano Completo. TRUE quando a loja
-- pagou o Completo OU está em trial ainda não vencido / isenta / com
-- a cobrança da plataforma desligada -- a landing page promete "7 dias
-- grátis, tudo liberado", então não faz sentido travar feature premium
-- de quem ainda nem escolheu plano. Espelha a MESMA lógica de
-- bloqueio de get_my_subscription_status (abaixo) -- único lugar que
-- sabe essa regra; toda RPC/view que precisa checar plano chama esta
-- função em vez de reimplementar trial/bloqueio.
-- ============================================================
CREATE OR REPLACE FUNCTION establishment_has_completo_access(p_establishment_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e establishments%ROWTYPE;
  v_billing_enabled BOOLEAN;
BEGIN
  SELECT * INTO e FROM establishments WHERE id = p_establishment_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF e.plan_tier = 'completo' THEN
    RETURN true;
  END IF;

  SELECT ps.billing_enabled INTO v_billing_enabled FROM platform_settings ps LIMIT 1;

  IF NOT COALESCE(v_billing_enabled, false) OR e.subscription_status = 'exempt' THEN
    RETURN true;
  END IF;

  IF e.subscription_status = 'active' THEN
    RETURN e.current_period_end IS NOT NULL AND e.current_period_end >= now();
  END IF;

  -- 'trial' (ou status futuro desconhecido): sem prazo definido = livre.
  RETURN e.trial_ends_at IS NULL OR e.trial_ends_at >= now();
END;
$$;

GRANT EXECUTE ON FUNCTION establishment_has_completo_access(UUID) TO anon, authenticated;

-- ============================================================
-- get_my_subscription_status ganha plan_tier + completo_access no
-- retorno, pro painel gatear features sem uma segunda ida ao banco.
-- Precisa DROP porque muda a lista de colunas do RETURNS TABLE (mesmo
-- motivo das migrations 011/015).
--
-- Corrige de passagem um bug pré-existente: o SELECT abaixo lia a
-- coluna `billing_enabled` de platform_settings sem qualificar,
-- colidindo com o parâmetro de saída de mesmo nome no RETURNS TABLE
-- -- Postgres rejeitava com "column reference billing_enabled is
-- ambiguous" toda vez que a função rodava (confirmado nos logs do
-- app), e o painel sempre caía no fallback local {blocked:false,
-- monthlyPrice:49.9} em vez de usar o resultado real da função.
-- ============================================================
DROP FUNCTION IF EXISTS get_my_subscription_status();

CREATE OR REPLACE FUNCTION get_my_subscription_status()
RETURNS TABLE(
  blocked BOOLEAN,
  status TEXT,
  trial_ends_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  monthly_price NUMERIC,
  billing_enabled BOOLEAN,
  plan_tier TEXT,
  completo_access BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_establishment_id UUID;
  v_billing_enabled BOOLEAN;
  v_monthly_price NUMERIC;
  v_status TEXT;
  v_trial_ends_at TIMESTAMPTZ;
  v_current_period_end TIMESTAMPTZ;
  v_plan_tier TEXT;
  v_blocked BOOLEAN := false;
BEGIN
  SELECT ps.billing_enabled, ps.monthly_price INTO v_billing_enabled, v_monthly_price FROM platform_settings ps LIMIT 1;

  SELECT e.id, e.subscription_status, e.trial_ends_at, e.current_period_end, e.plan_tier
  INTO v_establishment_id, v_status, v_trial_ends_at, v_current_period_end, v_plan_tier
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
      v_blocked := v_trial_ends_at IS NOT NULL AND v_trial_ends_at < now();
    END IF;
  END IF;

  RETURN QUERY SELECT
    v_blocked,
    v_status,
    v_trial_ends_at,
    v_current_period_end,
    COALESCE(v_monthly_price, 49.90),
    COALESCE(v_billing_enabled, false),
    v_plan_tier,
    establishment_has_completo_access(v_establishment_id);
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_subscription_status() TO authenticated;

-- ============================================================
-- Cardápio público: expõe plan_tier (pra UI condicional em
-- PublicMenuClient) e trava mercadopago_pix_enabled também ao plano,
-- além da conexão MP já existente. Reexpõe todas as colunas já
-- públicas (mesmo padrão das migrations 030/036 -- senão elas somem).
-- ============================================================
CREATE OR REPLACE VIEW public_establishments AS
SELECT
  e.id,
  e.name,
  e.slug,
  e.whatsapp_number,
  e.logo_url,
  e.theme_color,
  e.address,
  e.opening_hours,
  e.is_open,
  e.delivery_fee,
  e.offers_delivery,
  e.offers_pickup,
  e.order_tracking_enabled,
  e.use_neighborhood_delivery_fee,
  e.birthday_discount_percent,
  e.free_shipping_threshold,
  e.pix_key,
  e.pix_city,
  e.custom_domain,
  EXISTS (
    SELECT 1 FROM mercadopago_accounts ma
    WHERE ma.establishment_id = e.id AND ma.is_active = true
  ) AND e.billing_mode = 'comissao' AND establishment_has_completo_access(e.id) AS mercadopago_pix_enabled,
  e.description,
  e.instagram_url,
  e.plan_tier,
  -- Acesso EFETIVO (respeita trial/isenção), não só o plan_tier cru --
  -- é o que o client usa pra decidir se mostra cupom/fidelidade, sem
  -- precisar saber nada sobre trial (a loja continua "tudo liberado"
  -- durante o trial mesmo com plan_tier='essencial').
  establishment_has_completo_access(e.id) AS has_completo_access
FROM establishments e;

GRANT SELECT ON public_establishments TO anon, authenticated;

-- ============================================================
-- Fidelidade: loja essencial (fora do trial) simplesmente não
-- aparece com fidelidade nenhuma no cardápio público -- sem precisar
-- mudar PublicMenuClient.tsx pra esconder a seção.
-- ============================================================
CREATE OR REPLACE VIEW public_loyalty_settings AS
SELECT establishment_id, is_active, points_per_currency, min_order_value_for_points
FROM loyalty_settings
WHERE establishment_has_completo_access(establishment_id);

CREATE OR REPLACE VIEW public_loyalty_rewards AS
SELECT id, establishment_id, name, description, points_cost, benefit_type, benefit_value
FROM loyalty_rewards
WHERE is_active = true AND establishment_has_completo_access(establishment_id);

GRANT SELECT ON public_loyalty_settings TO anon, authenticated;
GRANT SELECT ON public_loyalty_rewards TO anon, authenticated;

-- ============================================================
-- Cupons: mesmo padrão de retorno que a função já usa pras outras
-- validações (cupom não encontrado/inativo/expirado/esgotado).
-- ============================================================
DROP FUNCTION IF EXISTS validate_coupon(UUID, TEXT, TEXT);

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
  IF NOT establishment_has_completo_access(p_establishment_id) THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::NUMERIC, 'Cupons não disponíveis nesta loja.';
    RETURN;
  END IF;

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

  IF c.max_uses_per_customer IS NOT NULL AND p_customer_phone IS NOT NULL AND trim(p_customer_phone) <> '' THEN
    SELECT COUNT(*) INTO v_used_by_customer
    FROM orders o
    WHERE o.establishment_id = p_establishment_id
      AND o.coupon_code = c.code
      AND o.customer_phone = p_customer_phone
      AND o.status <> 'cancelled';

    IF v_used_by_customer >= c.max_uses_per_customer THEN
      RETURN QUERY SELECT false, NULL::TEXT, NULL::NUMERIC, 'Você já usou este cupom.';
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT true, c.discount_type, c.discount_value, 'Cupom aplicado!'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION validate_coupon(UUID, TEXT, TEXT) TO anon, authenticated;

-- ============================================================
-- Fidelidade (resgate): mesmo padrão de retorno que a função já usa
-- pras outras validações. Assinatura não muda (mesmos parâmetros/
-- retorno), então CREATE OR REPLACE direto, sem DROP.
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
  IF NOT establishment_has_completo_access(p_establishment_id) THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::NUMERIC, NULL::INT, 'Programa de fidelidade não disponível nesta loja.'::TEXT;
    RETURN;
  END IF;

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

-- ============================================================
-- Mesa/QR: mesmo padrão de erro que a função já usa (RAISE EXCEPTION).
-- PublicMenuClient.tsx já trata falha dessa RPC com fallback gracioso
-- pro cardápio normal (tableModeFailed), então uma loja rebaixada com
-- QR Codes antigos em circulação simplesmente cai no cardápio comum,
-- sem tela de erro pro cliente. Assinatura não muda, sem DROP.
-- ============================================================
CREATE OR REPLACE FUNCTION get_or_create_table_tab(p_establishment_id UUID, p_table_id UUID)
RETURNS TABLE(tab_id UUID, table_label TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table_label TEXT;
  v_tab_id UUID;
BEGIN
  IF NOT establishment_has_completo_access(p_establishment_id) THEN
    RAISE EXCEPTION 'Cardápio de mesa não disponível nesta loja.';
  END IF;

  SELECT label INTO v_table_label FROM restaurant_tables
  WHERE id = p_table_id AND establishment_id = p_establishment_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mesa não encontrada ou inativa.';
  END IF;

  INSERT INTO table_tabs (establishment_id, table_id, status)
  VALUES (p_establishment_id, p_table_id, 'open')
  ON CONFLICT (table_id) WHERE (status = 'open') DO NOTHING
  RETURNING id INTO v_tab_id;

  IF v_tab_id IS NULL THEN
    SELECT id INTO v_tab_id FROM table_tabs WHERE table_id = p_table_id AND status = 'open';
  END IF;

  RETURN QUERY SELECT v_tab_id, v_table_label;
END;
$$;

GRANT EXECUTE ON FUNCTION get_or_create_table_tab(UUID, UUID) TO anon, authenticated;
