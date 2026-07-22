-- ============================================================
-- CARDÁPIO SaaS - Migration 006
-- Limite de pedidos por telefone/loja em pouco tempo. Protege contra
-- spam/abuso no formulário público de pedido (que precisa aceitar
-- inserts de qualquer visitante, sem login). Roda no banco, então
-- vale mesmo que alguém tente pular o app e chamar a API direto.
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_order_spam()
RETURNS TRIGGER AS $$
DECLARE
  recent_count INT;
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM orders
  WHERE customer_phone = NEW.customer_phone
    AND establishment_id = NEW.establishment_id
    AND created_at > now() - INTERVAL '2 minutes';

  IF recent_count >= 3 THEN
    RAISE EXCEPTION 'Muitos pedidos em pouco tempo para este número. Aguarde alguns minutos e tente novamente.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_order_spam ON orders;

CREATE TRIGGER trg_prevent_order_spam
  BEFORE INSERT ON orders
  FOR EACH ROW
  WHEN (NEW.source = 'online')
  EXECUTE FUNCTION prevent_order_spam();
