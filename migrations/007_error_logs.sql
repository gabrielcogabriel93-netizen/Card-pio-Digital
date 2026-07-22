-- ============================================================
-- CARDÁPIO SaaS - Migration 007
-- Registro de erros críticos que acontecem em produção (falha ao
-- enviar pedido, ao confirmar pedido, ao fechar venda no balcão, ou
-- qualquer erro não tratado capturado por um error boundary). Sem
-- isso, um erro que acontece com um cliente/lojista some no console
-- do navegador dele e ninguém mais fica sabendo.
-- ============================================================

CREATE TABLE error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  message TEXT NOT NULL,
  detail JSONB,
  url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_error_logs_establishment_id ON error_logs(establishment_id);
CREATE INDEX idx_error_logs_created_at ON error_logs(created_at);

ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- Qualquer pessoa pode registrar um erro (inclusive visitante anônimo no
-- cardápio público, que é exatamente quem mais precisa disso).
CREATE POLICY "error_logs_insert_anyone" ON error_logs
  FOR INSERT WITH CHECK (true);

-- Só o dono do estabelecimento (ou logs sem loja associada, ex: erro na
-- landing page/login) consegue ler.
CREATE POLICY "error_logs_select_owner" ON error_logs
  FOR SELECT USING (
    establishment_id IN (
      SELECT id FROM establishments WHERE owner_id = auth.uid()
    )
  );
