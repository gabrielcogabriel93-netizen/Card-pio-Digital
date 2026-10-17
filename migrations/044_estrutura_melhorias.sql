-- ============================================================
-- Migration 044 -- estrutura para as melhorias da auditoria
-- (rodar ANTES da 045, que depende destas colunas).
--
-- 1. Loja: tempo de entrega exibido no topo do cardápio, pedido mínimo,
--    pausa temporária ("cozinha cheia"), fuso horário, selo da
--    plataforma removível, link de avaliação no Google.
-- 2. Produto: "acabou hoje" (esgotado até uma data, sem mexer em
--    estoque). Grupo de variação: limite de escolhas ("escolha até 3").
-- 3. Pedido: horário de cada etapa (aceito, saiu, concluído,
--    cancelado), tempo estimado informado no aceite, troco, origem do
--    desconto e avaliação do cliente.
-- 4. Cliente: quando a data de nascimento foi informada (evita o
--    desconto de aniversário "autodeclarado na hora").
-- 5. Unicidade de uma loja por dono, quando os dados permitirem.
-- 6. Views públicas atualizadas e get_order_status com os novos campos.
-- ============================================================

-- 1. LOJA
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS delivery_time_min INT CHECK (delivery_time_min IS NULL OR delivery_time_min BETWEEN 0 AND 600);
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS delivery_time_max INT CHECK (delivery_time_max IS NULL OR delivery_time_max BETWEEN 0 AND 600);
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS min_order_value NUMERIC(10,2) CHECK (min_order_value IS NULL OR min_order_value >= 0);
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS paused_until TIMESTAMPTZ;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo';
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS hide_platform_badge BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS google_review_url TEXT;

-- 1b. LOGS DE ERRO (aba /admin/logs): nível, origem (servidor/navegador)
-- e navegador de quem teve o erro.
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS level TEXT NOT NULL DEFAULT 'error';
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_error_logs_level_created ON error_logs(level, created_at DESC);

-- 2. PRODUTO / VARIAÇÃO
ALTER TABLE products ADD COLUMN IF NOT EXISTS sold_out_until TIMESTAMPTZ;
ALTER TABLE variation_groups ADD COLUMN IF NOT EXISTS max_select INT CHECK (max_select IS NULL OR max_select >= 1);

-- 3. PEDIDO
ALTER TABLE orders ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS eta_minutes INT CHECK (eta_minutes IS NULL OR eta_minutes BETWEEN 0 AND 600);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS change_for NUMERIC(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_source TEXT CHECK (discount_source IS NULL OR discount_source IN ('coupon', 'loyalty', 'birthday', 'manual'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS priced_by_server BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_rating INT CHECK (customer_rating IS NULL OR customer_rating BETWEEN 1 AND 5);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_review TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_est_status_created ON orders(establishment_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_est_phone ON orders(establishment_id, customer_phone);

-- Horário de cada etapa, preenchido sozinho na troca de status (vale
-- para Kanban, webhook do Mercado Pago e automação por tempo).
CREATE OR REPLACE FUNCTION set_order_step_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('confirmed', 'preparing', 'completed') AND OLD.status = 'pending' AND NEW.accepted_at IS NULL THEN
      NEW.accepted_at := now();
    END IF;
    IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    END IF;
    IF NEW.status = 'cancelled' AND NEW.cancelled_at IS NULL THEN
      NEW.cancelled_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_step_timestamps ON orders;
CREATE TRIGGER trg_order_step_timestamps
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION set_order_step_timestamps();

-- 4. CLIENTE
ALTER TABLE customers ADD COLUMN IF NOT EXISTS birth_date_set_at TIMESTAMPTZ;
UPDATE customers SET birth_date_set_at = COALESCE(updated_at, created_at, now()) - INTERVAL '31 days'
WHERE birth_date IS NOT NULL AND birth_date_set_at IS NULL;

-- 5. UMA LOJA POR DONO -- só cria o índice se não houver duplicadas
-- (se houver, avisa e segue; resolver as duplicadas à mão e rodar de novo).
DO $$
BEGIN
  IF EXISTS (SELECT owner_id FROM establishments GROUP BY owner_id HAVING COUNT(*) > 1) THEN
    RAISE NOTICE 'Há donos com mais de uma loja: índice único de owner_id NÃO criado.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS idx_establishments_owner_unique ON establishments(owner_id);
  END IF;
END $$;

-- 6. VIEWS PÚBLICAS
-- Produto esgotado "até amanhã" aparece como sem estoque.
CREATE OR REPLACE VIEW public_products AS
SELECT
  id,
  establishment_id,
  category_id,
  name,
  description,
  price,
  image_url,
  display_order,
  (CASE WHEN track_stock THEN stock_qty > 0 ELSE true END)
    AND (sold_out_until IS NULL OR sold_out_until <= now()) AS in_stock,
  is_featured,
  pizza_flavor_id
FROM products
WHERE is_active = true;

GRANT SELECT ON public_products TO anon, authenticated;

CREATE OR REPLACE VIEW public_establishments AS
SELECT
  e.id,
  e.name,
  e.slug,
  e.whatsapp_number,
  e.logo_url,
  e.theme_color,
  e.address,
  e.opening_hours,
  e.is_open,
  e.delivery_fee,
  e.offers_delivery,
  e.offers_pickup,
  e.order_tracking_enabled,
  e.use_neighborhood_delivery_fee,
  e.birthday_discount_percent,
  e.free_shipping_threshold,
  e.pix_key,
  e.pix_city,
  e.custom_domain,
  EXISTS (
    SELECT 1 FROM mercadopago_accounts ma
    WHERE ma.establishment_id = e.id AND ma.is_active = true
  ) AND e.billing_mode = 'comissao' AND establishment_has_completo_access(e.id) AS mercadopago_pix_enabled,
  e.description,
  e.instagram_url,
  e.plan_tier,
  establishment_has_completo_access(e.id) AS has_completo_access,
  e.delivery_time_min,
  e.delivery_time_max,
  e.min_order_value,
  e.paused_until,
  e.timezone,
  -- Remover o selo da plataforma é recurso do plano Completo.
  (e.hide_platform_badge AND establishment_has_completo_access(e.id)) AS hide_platform_badge,
  e.google_review_url
FROM establishments e;

GRANT SELECT ON public_establishments TO anon, authenticated;

-- get_order_status: novos campos para a página de acompanhamento.
DROP FUNCTION IF EXISTS get_order_status(UUID);

CREATE FUNCTION get_order_status(p_order_id UUID)
RETURNS TABLE(
  id UUID,
  status TEXT,
  customer_name TEXT,
  items JSONB,
  subtotal NUMERIC,
  shipping_fee NUMERIC,
  discount NUMERIC,
  total NUMERIC,
  order_type TEXT,
  delivery_address JSONB,
  payment_method TEXT,
  coupon_code TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ,
  establishment_name TEXT,
  establishment_slug TEXT,
  establishment_theme_color TEXT,
  order_tracking_enabled BOOLEAN,
  payment_status TEXT,
  cancellation_reason TEXT,
  accepted_at TIMESTAMPTZ,
  dispatched_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  eta_minutes INT,
  change_for NUMERIC,
  establishment_whatsapp TEXT,
  establishment_logo_url TEXT,
  google_review_url TEXT,
  customer_rating INT,
  establishment_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT o.id, o.status, o.customer_name, o.items, o.subtotal, o.shipping_fee,
         o.discount, o.total, o.order_type, o.delivery_address, o.payment_method,
         o.coupon_code, o.notes, o.created_at,
         e.name, e.slug, e.theme_color, COALESCE(e.order_tracking_enabled, true),
         o.payment_status, o.cancellation_reason,
         o.accepted_at, o.dispatched_at, o.completed_at, o.cancelled_at, o.eta_minutes, o.change_for,
         e.whatsapp_number, e.logo_url, e.google_review_url, o.customer_rating, e.id
  FROM orders o
  JOIN establishments e ON e.id = o.establishment_id
  WHERE o.id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_order_status(UUID) TO anon, authenticated;

-- Avaliação pós-pedido: o id do pedido (UUID) é a credencial, mesmo
-- modelo de get_order_status. Só pedido concluído, uma vez.
CREATE OR REPLACE FUNCTION submit_order_review(p_order_id UUID, p_rating INT, p_comment TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated UUID;
BEGIN
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Nota inválida.';
  END IF;

  UPDATE orders
  SET customer_rating = p_rating,
      customer_review = NULLIF(left(trim(COALESCE(p_comment, '')), 500), ''),
      reviewed_at = now()
  WHERE id = p_order_id AND status = 'completed' AND reviewed_at IS NULL
  RETURNING id INTO v_updated;

  RETURN v_updated IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_order_review(UUID, INT, TEXT) TO anon, authenticated;

-- ============================================================
-- 7. LIMPEZA DE DADOS (auditoria C6): a automação por tempo lançava a
-- despesa "Comissão da plataforma (Mercado Pago)" de R$ 1 em QUALQUER
-- pedido aceito sozinho, inclusive pago em dinheiro. Remove só esses
-- lançamentos indevidos; os de Pix automático pago continuam.
-- ============================================================
DELETE FROM financial_entries fe
USING orders o
WHERE fe.order_id = o.id
  AND fe.type = 'expense'
  AND fe.description = 'Comissão da plataforma (Mercado Pago)'
  AND (o.payment_method IS DISTINCT FROM 'mercadopago_pix' OR o.payment_status IS DISTINCT FROM 'approved');
