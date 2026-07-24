-- ============================================================
-- CARDÁPIO SaaS - Migration 014
-- Notificações Push (Web Push): avisa o lojista de um novo pedido mesmo
-- com o painel fechado ou o celular na cozinha, em vez de depender só
-- do beep sonoro (que só funciona com a aba /painel/pedidos aberta).
--
-- Como funciona:
-- 1. O navegador do lojista se inscreve (Notification API + Push API) e
--    salva a "inscrição" (endpoint + chaves) na tabela abaixo.
-- 2. Ao chegar um pedido novo do cardápio online, um TRIGGER no banco
--    chama a rota /api/push/send da própria aplicação via HTTP (pg_net).
-- 3. Essa rota busca as inscrições da loja e envia o push de verdade
--    (só o servidor tem a chave privada VAPID pra isso).
--
-- ⚠️ PASSO MANUAL OBRIGATÓRIO após rodar esta migration: troque a URL
-- de exemplo abaixo (SEU_DOMINIO_AQUI) pelo domínio real do seu deploy,
-- e o segredo pelo mesmo valor de PUSH_TRIGGER_SECRET no seu .env. Sem
-- isso o trigger não vai saber pra onde mandar o aviso. Veja o README.
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_establishment_id ON push_subscriptions(establishment_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Só o dono do estabelecimento gerencia as próprias inscrições. A rota
-- /api/push/send lê com a service role key (bypassa RLS de propósito —
-- precisa ler inscrições de QUALQUER loja quando chamada pelo trigger).
--
-- DROP antes de CREATE porque "CREATE POLICY" não tem IF NOT EXISTS no
-- Postgres — sem isso, rodar a migration de novo quebra com "policy
-- already exists".
DROP POLICY IF EXISTS "push_subscriptions_select_owner" ON push_subscriptions;
CREATE POLICY "push_subscriptions_select_owner" ON push_subscriptions
  FOR SELECT USING (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "push_subscriptions_insert_owner" ON push_subscriptions;
CREATE POLICY "push_subscriptions_insert_owner" ON push_subscriptions
  FOR INSERT WITH CHECK (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "push_subscriptions_delete_owner" ON push_subscriptions;
CREATE POLICY "push_subscriptions_delete_owner" ON push_subscriptions
  FOR DELETE USING (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));

-- ============================================================
-- Trigger: avisa a rota /api/push/send a cada pedido novo do cardápio
-- online. Usa a extensão pg_net (já vem habilitada por padrão em
-- projetos Supabase) pra fazer a chamada HTTP de dentro do Postgres.
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION notify_new_order_push()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.source = 'online' THEN
    PERFORM net.http_post(
      -- TROQUE pela URL real do seu deploy, SEM barra dupla (cuidado se
      -- o seu domínio já termina em "/" — não repita a barra aqui).
      -- Ex: https://minhaloja.vercel.app/api/push/send
      url := 'https://SEU_DOMINIO_AQUI/api/push/send',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        -- TROQUE por o mesmo valor de PUSH_TRIGGER_SECRET do seu .env.
        -- Não deixe o valor real aqui se este arquivo for pro Git —
        -- rode a versão com o valor de verdade direto no SQL Editor do
        -- Supabase, sem commitar o segredo no repositório.
        'x-push-secret', 'SEU_PUSH_TRIGGER_SECRET_AQUI'
      ),
      body := jsonb_build_object(
        'establishment_id', NEW.establishment_id,
        'order_id', NEW.id,
        'customer_name', NEW.customer_name,
        'total', NEW.total
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_notify_new_order_push ON orders;

CREATE TRIGGER trg_notify_new_order_push
  AFTER INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_order_push();
