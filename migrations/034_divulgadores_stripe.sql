-- ============================================================
-- CatalogAI - Migration 034
-- Comissões para divulgadores (afiliados) + troca do motor de cobrança
-- da MENSALIDADE DA PLATAFORMA (migration 032) de Mercado Pago para
-- Stripe Billing + Stripe Connect.
--
-- Não mexe em nada do pagamento que cada estabelecimento recebe dos
-- PRÓPRIOS clientes finais (isso continua 100% Mercado Pago, ver
-- mercadopago_accounts / migration 026) — só na cobrança que o
-- estabelecimento paga PRA a plataforma. `platform_settings`,
-- `subscription_payments` e `establishments.subscription_pix_payment_id`
-- (migration 032) ficam parados, sem uso — nunca deletar dado.
--
-- Split: a Stripe divide o valor na própria cobrança
-- (application_fee_percent + transfer_data.destination), então não
-- existe aqui uma tabela de "transferência pendente" pra reprocessar —
-- `comissoes` é só o espelho local do que a Stripe já processou, pra
-- relatório no painel admin/divulgador.
-- ============================================================

-- 1. COLUNAS STRIPE EM establishments (aditivo — subscription_status/
--    trial_ends_at/current_period_end continuam sendo a fonte da verdade
--    pro bloqueio, get_my_subscription_status() não muda).
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- 2. DIVULGADORES
-- Autenticação reaproveita o Supabase Auth (mesmo padrão de
-- establishments.owner_id) — user_id é o dono do login, não um sistema
-- de senha próprio.
CREATE TABLE IF NOT EXISTS divulgadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  codigo_afiliado TEXT NOT NULL UNIQUE,
  stripe_account_id TEXT,
  stripe_onboarding_completo BOOLEAN NOT NULL DEFAULT false,
  percentual_comissao NUMERIC(5,2) NOT NULL DEFAULT 10.00 CHECK (percentual_comissao > 0 AND percentual_comissao <= 100),
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_divulgadores_codigo_afiliado ON divulgadores(codigo_afiliado);

-- 3. INDICAÇÕES
-- UNIQUE em estabelecimento_id garante "um estabelecimento só pode ter
-- um divulgador" a nível de banco. Sem policy de UPDATE/DELETE pra
-- ninguém (nem o dono do estabelecimento) -> vínculo imutável por
-- construção depois de criado.
CREATE TABLE IF NOT EXISTS indicacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  divulgador_id UUID REFERENCES divulgadores(id) ON DELETE CASCADE NOT NULL,
  estabelecimento_id UUID REFERENCES establishments(id) ON DELETE CASCADE NOT NULL UNIQUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_indicacoes_divulgador ON indicacoes(divulgador_id);

-- 4. COMISSÕES
-- Espelho local de cada fatura da Stripe que gerou split (relatório,
-- não fila de pagamento -- a Stripe já paga sozinha). stripe_invoice_id
-- único é a chave de idempotência do webhook: reenvio de evento nunca
-- duplica uma comissão.
CREATE TABLE IF NOT EXISTS comissoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  divulgador_id UUID REFERENCES divulgadores(id) ON DELETE CASCADE NOT NULL,
  estabelecimento_id UUID REFERENCES establishments(id) ON DELETE CASCADE NOT NULL,
  stripe_invoice_id TEXT NOT NULL UNIQUE,
  valor_assinatura NUMERIC(10,2) NOT NULL,
  percentual_aplicado NUMERIC(5,2) NOT NULL,
  valor_comissao NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmada' CHECK (status IN ('confirmada', 'falhou')),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comissoes_divulgador ON comissoes(divulgador_id);
CREATE INDEX IF NOT EXISTS idx_comissoes_estabelecimento ON comissoes(estabelecimento_id);

-- 5. RLS
-- divulgadores: só o próprio dono (auth.uid()) lê/atualiza o próprio
-- perfil -- mesmo padrão de establishments_select_owner (migration 001).
-- Sem policy pública, sem policy de admin: admin acessa via service role
-- nas rotas /api/admin/**, mesmo padrão de mercadopago_accounts/
-- platform_settings (migration 026/032).
ALTER TABLE divulgadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "divulgadores_select_owner" ON divulgadores
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "divulgadores_update_owner" ON divulgadores
  FOR UPDATE USING (user_id = auth.uid());

-- Sem policy de INSERT: criação da linha é sempre via service role, na
-- rota /api/divulgador/cadastro (precisa criar a conta conectada Stripe
-- no mesmo passo, então não faz sentido o client inserir direto).

-- indicacoes: divulgador só lê as próprias indicações. Sem policy de
-- INSERT/UPDATE/DELETE pra client nenhum -- só service role, na rota
-- /api/indicacao/vincular, o que já torna o vínculo imutável.
ALTER TABLE indicacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "indicacoes_select_owner" ON indicacoes
  FOR SELECT USING (
    divulgador_id IN (SELECT id FROM divulgadores WHERE user_id = auth.uid())
  );

-- comissoes: mesmo padrão -- só leitura pelo próprio divulgador, escrita
-- só via service role (webhook da Stripe).
ALTER TABLE comissoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comissoes_select_owner" ON comissoes
  FOR SELECT USING (
    divulgador_id IN (SELECT id FROM divulgadores WHERE user_id = auth.uid())
  );
