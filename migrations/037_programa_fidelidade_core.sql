-- ============================================================
-- CatalogAI - Migration 037
-- Programa de fidelidade (pontos) — schema base: configuração por loja,
-- catálogo de recompensas e saldo do cliente. Segue de perto o padrão de
-- cupons (008/015): SECURITY DEFINER para tudo que o visitante público
-- toca (migration 038), RLS normal (dono) para o que o lojista gerencia
-- pelo painel, e views públicas explícitas (nunca a tabela inteira) para
-- o que o cliente final pode enxergar.
--
-- Saldo de pontos mora em `customers` (mesma tabela de 016/018), igual
-- birth_date — não criamos uma tabela de "conta" à parte porque customers
-- já é 1 linha por (establishment_id, phone). `loyalty_transactions` é o
-- LEDGER (auditoria/estorno), nunca a fonte de saldo em si: o saldo é
-- sempre customers.loyalty_points_balance, mantido só pelos triggers da
-- migration 038, nunca por escrita direta do client.
-- ============================================================

ALTER TABLE customers ADD COLUMN IF NOT EXISTS loyalty_points_balance INT NOT NULL DEFAULT 0;
-- Sem CHECK (>= 0) de propósito: se um pedido 'completed' que já gerou
-- pontos for cancelado DEPOIS de o cliente já ter resgatado esses pontos
-- em outro pedido, o estorno pode levar o saldo a negativo. É um edge
-- case raro, aceito aqui — quem trava é a validação de um NOVO resgate
-- (exige saldo >= custo), não a consistência do ledger.

CREATE TABLE IF NOT EXISTS loyalty_settings (
  establishment_id UUID PRIMARY KEY REFERENCES establishments(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT false,
  points_per_currency NUMERIC(10,4) NOT NULL DEFAULT 1, -- pontos ganhos por R$1 gasto (sobre o total pago)
  min_order_value_for_points NUMERIC(10,2), -- NULL = sem pedido mínimo pra pontuar
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loyalty_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  points_cost INT NOT NULL CHECK (points_cost > 0),
  benefit_type TEXT NOT NULL CHECK (benefit_type IN ('percent_discount', 'fixed_discount', 'free_shipping')),
  benefit_value NUMERIC(10,2), -- percentual ou valor fixo; NULL quando benefit_type = 'free_shipping'
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_establishment_id ON loyalty_rewards(establishment_id);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  reward_id UUID REFERENCES loyalty_rewards(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('earn', 'redeem', 'revoke_earn', 'revoke_redeem')),
  points INT NOT NULL, -- assinado: positivo = crédito, negativo = débito
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_customer_id ON loyalty_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_order_id ON loyalty_transactions(order_id);

ALTER TABLE loyalty_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;

-- loyalty_settings: CRUD do dono, sem DELETE (linha 1:1 por loja — pra
-- desligar o programa basta is_active = false).
CREATE POLICY "loyalty_settings_select_owner" ON loyalty_settings
  FOR SELECT USING (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));
CREATE POLICY "loyalty_settings_insert_owner" ON loyalty_settings
  FOR INSERT WITH CHECK (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));
CREATE POLICY "loyalty_settings_update_owner" ON loyalty_settings
  FOR UPDATE USING (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));

-- loyalty_rewards: CRUD completo do dono, igual coupons (008).
CREATE POLICY "loyalty_rewards_select_owner" ON loyalty_rewards
  FOR SELECT USING (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));
CREATE POLICY "loyalty_rewards_insert_owner" ON loyalty_rewards
  FOR INSERT WITH CHECK (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));
CREATE POLICY "loyalty_rewards_update_owner" ON loyalty_rewards
  FOR UPDATE USING (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));
CREATE POLICY "loyalty_rewards_delete_owner" ON loyalty_rewards
  FOR DELETE USING (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));

-- loyalty_transactions: só LEITURA do dono (auditoria/CRM futuro) — sem
-- policy de escrita nenhuma, igual customers/customer_addresses (016):
-- só as funções SECURITY DEFINER da migration 038 escrevem aqui.
CREATE POLICY "loyalty_transactions_select_owner" ON loyalty_transactions
  FOR SELECT USING (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));

-- Views públicas: só o que o cardápio precisa pra listar recompensas
-- resgatáveis e saber se o programa está ativo. Nunca expõe a tabela
-- inteira (mesmo espírito da 005).
CREATE OR REPLACE VIEW public_loyalty_settings AS
SELECT establishment_id, is_active, points_per_currency, min_order_value_for_points
FROM loyalty_settings;

CREATE OR REPLACE VIEW public_loyalty_rewards AS
SELECT id, establishment_id, name, description, points_cost, benefit_type, benefit_value
FROM loyalty_rewards
WHERE is_active = true;

GRANT SELECT ON public_loyalty_settings TO anon, authenticated;
GRANT SELECT ON public_loyalty_rewards TO anon, authenticated;
