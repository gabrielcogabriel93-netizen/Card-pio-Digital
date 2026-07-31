-- ============================================================
-- CARDÁPIO SaaS - Migration 029
-- Automação de status de pedido por tempo — opt-in por loja. Em
-- 'manual' (padrão, ninguém muda de comportamento sem escolher) nada
-- muda. Em 'automatic', o pedido avança sozinho pelas etapas (Pendente
-- → Confirmado → Em Preparo → Concluído) no tempo que o lojista
-- configurar, pensado pra quem não tem ninguém disponível pra ficar
-- clicando no Kanban.
--
-- ⚠️ PASSO MANUAL OBRIGATÓRIO após rodar esta migration (mesma ideia da
-- migration 014): troque a URL de exemplo abaixo pelo domínio real do
-- deploy e o segredo pelo mesmo valor de CRON_TRIGGER_SECRET do seu
-- .env. Rode a versão com os valores de verdade direto no SQL Editor do
-- Supabase — não commite segredo real no repositório. Se o projeto
-- ainda não tiver a extensão pg_cron habilitada, habilite em Database >
-- Extensions antes de rodar esta migration.
-- ============================================================

-- 1. CONFIGURAÇÃO DE AUTOMAÇÃO POR LOJA
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS order_automation_mode TEXT NOT NULL DEFAULT 'manual'
  CHECK (order_automation_mode IN ('manual', 'automatic'));
-- Pendente -> Confirmado (ou Concluído, se acompanhamento desligado).
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS auto_confirm_minutes INT NOT NULL DEFAULT 2;
-- Confirmado -> Em Preparo.
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS auto_preparing_minutes INT NOT NULL DEFAULT 5;
-- Em Preparo -> Concluído. Separado por tipo porque entrega e retirada
-- têm durações reais bem diferentes — os outros dois passos não mudam
-- por causa disso.
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS auto_completed_minutes_pickup INT NOT NULL DEFAULT 15;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS auto_completed_minutes_delivery INT NOT NULL DEFAULT 30;

-- 2. RELÓGIO DE "HÁ QUANTO TEMPO ESTÁ NESSE STATUS"
-- Não dá pra usar `updated_at` (muda por qualquer motivo, não só troca
-- de status). Setado sozinho por trigger sempre que `status` muda de
-- verdade — vale pro clique manual, pro webhook do Mercado Pago e pra
-- automação nova, sem precisar lembrar de setar isso em cada lugar.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION set_order_status_changed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_status_changed_at ON orders;
CREATE TRIGGER trg_orders_status_changed_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION set_order_status_changed_at();

-- ============================================================
-- 3. AGENDAMENTO: chama a rota da aplicação a cada minuto. Sem lógica
-- de negócio aqui — só "avise a aplicação", igual o trigger de push da
-- migration 014. Toda a decisão de quais pedidos avançar fica em
-- TypeScript (app/api/cron/advance-orders).
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'advance-automatic-orders',
  '* * * * *',
  $$
  SELECT net.http_post(
    -- TROQUE pela URL real do seu deploy, sem barra dupla.
    -- Ex: https://minhaloja.vercel.app/api/cron/advance-orders
    url := 'https://SEU_DOMINIO_AQUI/api/cron/advance-orders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- TROQUE pelo mesmo valor de CRON_TRIGGER_SECRET do seu .env.
      'x-cron-secret', 'SEU_CRON_TRIGGER_SECRET_AQUI'
    ),
    body := '{}'::jsonb
  );
  $$
);
