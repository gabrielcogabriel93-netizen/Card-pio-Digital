-- ============================================================
-- Migration 051 -- aviso automático "a loja abriu"
-- (rodar DEPOIS da 049; pode rodar a qualquer momento).
--
-- Uma notificação por dia para os clientes da loja (com avisos ativos)
-- quando ela abre: pelo horário de funcionamento ou quando o lojista liga
-- "Aberta". O lojista liga/desliga e escolhe entre a mensagem dele ou a
-- automática (um produto do cardápio por dia, só com nome, preço e foto
-- cadastrados: nunca inventa promoção).
-- ============================================================

ALTER TABLE establishments ADD COLUMN IF NOT EXISTS open_push_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS open_push_mode TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS open_push_title TEXT;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS open_push_body TEXT;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS open_push_product_id UUID REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS open_push_last_sent_at TIMESTAMPTZ;
-- Quando o lojista ligou "Aberta" pela última vez (aviso na hora da abertura manual).
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'establishments_open_push_mode_check') THEN
    ALTER TABLE establishments ADD CONSTRAINT establishments_open_push_mode_check CHECK (open_push_mode IN ('auto', 'custom'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION set_establishment_opened_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_open AND (TG_OP = 'INSERT' OR OLD.is_open IS DISTINCT FROM true) THEN
    NEW.opened_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_establishment_opened_at ON establishments;
CREATE TRIGGER trg_establishment_opened_at
  BEFORE INSERT OR UPDATE OF is_open ON establishments
  FOR EACH ROW
  EXECUTE FUNCTION set_establishment_opened_at();
