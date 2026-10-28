-- ============================================================
-- Freguês - Migration 058: postagens com o que acontece na loja
--
-- A sugestão do dia deixa de ser só "produto": pode ser cupom ativo,
-- avaliação de cliente, nota da loja, fidelidade, aniversário, entrega
-- grátis, combo, novidade, marco de pedidos ou o app da loja
-- (lib/marketingTopics.ts). Guarda o tema para não repetir em seguida.
-- ============================================================

ALTER TABLE marketing_suggestions ADD COLUMN IF NOT EXISTS topic TEXT NOT NULL DEFAULT 'produto';
ALTER TABLE marketing_suggestions ADD COLUMN IF NOT EXISTS topic_key TEXT;
ALTER TABLE marketing_suggestions ADD COLUMN IF NOT EXISTS highlight TEXT;
ALTER TABLE marketing_suggestions ADD COLUMN IF NOT EXISTS image_url TEXT;
