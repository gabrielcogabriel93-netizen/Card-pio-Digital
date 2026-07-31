-- ============================================================
-- CARDÁPIO SaaS - Migration 028
-- Notificação push pro CLIENTE (não só pro lojista, que já tinha desde a
-- migration 014) — ativada na página pública de acompanhamento
-- (/pedido/[id]) pra avisar quando o status do pedido muda, sem precisar
-- ficar recarregando a página.
--
-- Tabela separada de `push_subscriptions` (essa é só do lojista, protegida
-- por RLS de dono) porque aqui não tem dono nenhum — a página de
-- acompanhamento é 100% pública, identificada só pelo UUID do pedido na
-- URL (mesmo modelo de segurança de `get_order_status`). UNIQUE por
-- (order_id, endpoint) — não por endpoint sozinho — porque o mesmo
-- navegador pode estar acompanhando vários pedidos ao mesmo tempo.
-- ============================================================

CREATE TABLE order_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (order_id, endpoint)
);

CREATE INDEX idx_order_push_subscriptions_order_id ON order_push_subscriptions(order_id);

ALTER TABLE order_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Só INSERT/DELETE públicos, de propósito sem SELECT — ninguém (nem o
-- próprio cliente) precisa listar essas linhas; a rota que manda o push
-- (/api/push/send-order) lê com a service role, que ignora RLS.
CREATE POLICY "order_push_subscriptions_insert_public" ON order_push_subscriptions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "order_push_subscriptions_delete_public" ON order_push_subscriptions
  FOR DELETE USING (true);
