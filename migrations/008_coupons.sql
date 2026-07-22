-- ============================================================
-- CARDÁPIO SaaS - Migration 008
-- Cupons de desconto para o cardápio público.
-- ============================================================

CREATE TABLE coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE NOT NULL,
  code TEXT NOT NULL,
  discount_type TEXT NOT NULL DEFAULT 'percent', -- 'percent' | 'fixed'
  discount_value NUMERIC(10,2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  max_uses INT,
  used_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(establishment_id, code)
);

CREATE INDEX idx_coupons_establishment_id ON coupons(establishment_id);

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coupons_select_owner" ON coupons
  FOR SELECT USING (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));

CREATE POLICY "coupons_insert_owner" ON coupons
  FOR INSERT WITH CHECK (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));

CREATE POLICY "coupons_update_owner" ON coupons
  FOR UPDATE USING (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));

CREATE POLICY "coupons_delete_owner" ON coupons
  FOR DELETE USING (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));

-- Pedidos guardam qual cupom foi usado e o valor do desconto aplicado.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount NUMERIC(10,2) DEFAULT 0;

-- Validação do cupom roda no banco (SECURITY DEFINER) em vez de expor a
-- tabela inteira de cupons publicamente — o visitante nunca lê a lista de
-- códigos, só recebe "válido/inválido" para o código que ele digitou.
CREATE OR REPLACE FUNCTION validate_coupon(p_establishment_id UUID, p_code TEXT)
RETURNS TABLE(valid BOOLEAN, discount_type TEXT, discount_value NUMERIC, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c coupons%ROWTYPE;
BEGIN
  SELECT * INTO c FROM coupons
  WHERE establishment_id = p_establishment_id
    AND upper(code) = upper(trim(p_code))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::NUMERIC, 'Cupom não encontrado.';
    RETURN;
  END IF;

  IF NOT c.is_active THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::NUMERIC, 'Cupom inativo.';
    RETURN;
  END IF;

  IF c.expires_at IS NOT NULL AND c.expires_at < now() THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::NUMERIC, 'Cupom expirado.';
    RETURN;
  END IF;

  IF c.max_uses IS NOT NULL AND c.used_count >= c.max_uses THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::NUMERIC, 'Cupom esgotado.';
    RETURN;
  END IF;

  RETURN QUERY SELECT true, c.discount_type, c.discount_value, 'Cupom aplicado!'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION validate_coupon(UUID, TEXT) TO anon, authenticated;

-- Contabiliza o uso do cupom quando o pedido é criado.
CREATE OR REPLACE FUNCTION increment_coupon_usage()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.coupon_code IS NOT NULL THEN
    UPDATE coupons SET used_count = used_count + 1
    WHERE establishment_id = NEW.establishment_id AND upper(code) = upper(NEW.coupon_code);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_increment_coupon_usage ON orders;

CREATE TRIGGER trg_increment_coupon_usage
  AFTER INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION increment_coupon_usage();
