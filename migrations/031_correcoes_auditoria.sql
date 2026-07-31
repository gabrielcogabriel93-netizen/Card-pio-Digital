-- ============================================================
-- CatalogAI - Migration 031
-- Correções da auditoria de prontidão comercial:
-- 1. Trava atômica no limite GLOBAL de usos de cupom (max_uses) — até
--    aqui só existia a checagem em validate_coupon (lida antes, sem
--    lock) e um incremento sem condição nenhuma em AFTER INSERT
--    (migration 008). Dois pedidos concorrentes podiam passar da
--    validação ao mesmo tempo e furar um cupom "primeiros 50 clientes".
--    Corrigido com incremento condicional (UPDATE ... WHERE used_count <
--    max_uses) dentro do BEFORE INSERT — o UPDATE trava a linha do
--    cupom, então dois inserts concorrentes serializam nessa checagem.
-- 2. Tabela de saúde de jobs do pg_cron — pra saber se a automação por
--    tempo (migration 029) está rodando de verdade, não só supor.
-- ============================================================

-- Substitui o incremento sem trava (migration 008) por um atômico.
DROP TRIGGER IF EXISTS trg_increment_coupon_usage ON orders;
DROP FUNCTION IF EXISTS increment_coupon_usage();

CREATE OR REPLACE FUNCTION enforce_coupon_max_uses()
RETURNS TRIGGER AS $$
DECLARE
  v_max_uses INT;
  v_updated_id UUID;
BEGIN
  IF NEW.coupon_code IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT max_uses INTO v_max_uses FROM coupons
  WHERE establishment_id = NEW.establishment_id AND upper(code) = upper(NEW.coupon_code)
  LIMIT 1;

  IF v_max_uses IS NULL THEN
    -- Sem limite global — só incrementa o contador, sem checagem.
    UPDATE coupons SET used_count = used_count + 1
    WHERE establishment_id = NEW.establishment_id AND upper(code) = upper(NEW.coupon_code);
  ELSE
    -- Incremento condicional: o UPDATE só "pega" a linha se ainda houver
    -- vaga, travando-a até o fim da transação — é isso que fecha a
    -- corrida entre dois pedidos concorrentes.
    UPDATE coupons SET used_count = used_count + 1
    WHERE establishment_id = NEW.establishment_id
      AND upper(code) = upper(NEW.coupon_code)
      AND used_count < v_max_uses
    RETURNING id INTO v_updated_id;

    IF v_updated_id IS NULL THEN
      RAISE EXCEPTION 'Este cupom já atingiu o limite de usos.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_enforce_coupon_max_uses ON orders;
CREATE TRIGGER trg_enforce_coupon_max_uses
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION enforce_coupon_max_uses();

-- Saúde dos jobs do pg_cron — cada rota de cron atualiza a própria linha
-- toda vez que roda; o painel confere se `last_run_at` está recente em
-- vez de só confiar que "automático" significa "funcionando".
CREATE TABLE IF NOT EXISTS cron_health (
  job_name TEXT PRIMARY KEY,
  last_run_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO cron_health (job_name, last_run_at)
VALUES ('advance-automatic-orders', now() - INTERVAL '1 hour')
ON CONFLICT (job_name) DO NOTHING;

ALTER TABLE cron_health ENABLE ROW LEVEL SECURITY;
-- SELECT público liberado de propósito: é só um timestamp, sem dado
-- sensível, e o painel do lojista (autenticado) precisa ler isso pra
-- mostrar o aviso de automação. Sem policy de INSERT/UPDATE/DELETE —
-- só a service role (rota do cron) escreve.
DROP POLICY IF EXISTS "cron_health_select_public" ON cron_health;
CREATE POLICY "cron_health_select_public" ON cron_health FOR SELECT USING (true);
