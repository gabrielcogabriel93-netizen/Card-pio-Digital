-- ============================================================
-- CatalogAI - Migration 042
-- Carrinho abandonado: detecta e registra quando um cliente chega a
-- informar o telefone na etapa de "Finalizar Pedido" mas não confirma
-- o envio em X minutos. O telefone só existe do lado do servidor a
-- partir do momento em que fica válido nesse campo (ver
-- PublicMenuClient.tsx, handleSendOrder/handleAddOrderToTable) -- não
-- dá pra detectar abandono de quem nunca chega nessa etapa, e essa
-- limitação já foi validada com o lojista antes de implementar.
--
-- IMPORTANTE (documentado também no app): não existe hoje um jeito do
-- servidor mandar WhatsApp sozinho pro cliente sem alguém clicar num
-- link wa.me. Esta migration só cria o REGISTRO/detecção -- o "lembrete"
-- de verdade é o lojista clicando num botão no painel (mesmo padrão já
-- usado em toda mensagem de WhatsApp do produto).
--
-- ⚠️ PASSO MANUAL OPCIONAL após rodar esta migration (mesma ideia das
-- migrations 014/029): se quiser que os rascunhos velhos sejam
-- marcados automaticamente (reminder_flagged_at) mesmo sem ninguém
-- abrir o painel, agende o cron abaixo trocando a URL/segredo pelos
-- valores reais. Sem isso, a lista em /painel/whatsapp ainda funciona
-- normalmente (calcula "abandonado" na hora, ao carregar a página) --
-- o cron só serve pra manter reminder_flagged_at preenchido como log
-- histórico (útil pro relatório financeiro contar quantos aconteceram).
-- ============================================================

CREATE TABLE cart_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_name TEXT,
  cart_snapshot JSONB NOT NULL,
  cart_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  reminder_flagged_at TIMESTAMPTZ,
  recovered_at TIMESTAMPTZ,
  -- Um rascunho ativo por cliente por loja -- um carrinho novo do mesmo
  -- telefone substitui o anterior (upsert), não acumula lixo.
  UNIQUE (establishment_id, customer_phone)
);

CREATE INDEX idx_cart_drafts_establishment_id ON cart_drafts(establishment_id);
CREATE INDEX idx_cart_drafts_pending ON cart_drafts(establishment_id, updated_at) WHERE recovered_at IS NULL;

ALTER TABLE establishments ADD COLUMN IF NOT EXISTS abandoned_cart_minutes INT NOT NULL DEFAULT 15;

-- ============================================================
-- RLS: só o dono lê (tem telefone/nome de cliente, mesmo cuidado de
-- customers/customer_addresses, migration 016). Nenhuma policy de
-- INSERT/UPDATE direta -- escrita só pela RPC SECURITY DEFINER abaixo,
-- chamada anonimamente pelo cardápio público.
-- ============================================================
ALTER TABLE cart_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cart_drafts_select_owner" ON cart_drafts
  FOR SELECT USING (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));

-- ============================================================
-- save_cart_draft: chamada (debounced) pelo cardápio público assim
-- que o telefone fica válido na etapa de checkout, e de novo a cada
-- mudança relevante do carrinho enquanto o modal está aberto. upsert
-- por (establishment_id, customer_phone) -- reabrir o carrinho depois
-- de recovered_at=true "reativa" o rascunho pro próximo ciclo.
-- ============================================================
CREATE OR REPLACE FUNCTION save_cart_draft(
  p_establishment_id UUID,
  p_customer_phone TEXT,
  p_customer_name TEXT,
  p_cart_snapshot JSONB,
  p_cart_total NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits TEXT := regexp_replace(p_customer_phone, '\D', '', 'g');
BEGIN
  IF v_digits = '' OR p_cart_snapshot IS NULL OR jsonb_array_length(p_cart_snapshot) = 0 THEN
    RETURN;
  END IF;

  INSERT INTO cart_drafts (establishment_id, customer_phone, customer_name, cart_snapshot, cart_total, updated_at, reminder_flagged_at, recovered_at)
  VALUES (p_establishment_id, v_digits, NULLIF(trim(p_customer_name), ''), p_cart_snapshot, p_cart_total, now(), NULL, NULL)
  ON CONFLICT (establishment_id, customer_phone) DO UPDATE SET
    customer_name = EXCLUDED.customer_name,
    cart_snapshot = EXCLUDED.cart_snapshot,
    cart_total = EXCLUDED.cart_total,
    updated_at = now(),
    reminder_flagged_at = NULL,
    recovered_at = NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION save_cart_draft(UUID, TEXT, TEXT, JSONB, NUMERIC) TO anon, authenticated;

-- ============================================================
-- mark_cart_draft_recovered: chamada ao concluir o pedido com sucesso
-- (handleSendOrder/handleAddOrderToTable) -- marca o rascunho
-- correspondente como recuperado, pra não aparecer como abandonado.
-- ============================================================
CREATE OR REPLACE FUNCTION mark_cart_draft_recovered(p_establishment_id UUID, p_customer_phone TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits TEXT := regexp_replace(p_customer_phone, '\D', '', 'g');
BEGIN
  IF v_digits = '' THEN
    RETURN;
  END IF;

  UPDATE cart_drafts
  SET recovered_at = now()
  WHERE establishment_id = p_establishment_id AND customer_phone = v_digits AND recovered_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_cart_draft_recovered(UUID, TEXT) TO anon, authenticated;

-- ============================================================
-- Agendamento opcional (ver comentário no topo). Sem valores reais
-- preenchidos, não executa nada -- copie e rode no SQL Editor do
-- Supabase com a URL/segredo verdadeiros se quiser o cron ativo.
-- ============================================================
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
--
-- SELECT cron.schedule(
--   'flag-abandoned-carts',
--   '*/5 * * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://SEU_DOMINIO_AQUI/api/cron/abandoned-carts',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'x-cron-secret', 'SEU_CRON_TRIGGER_SECRET_AQUI'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
