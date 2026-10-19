-- ============================================================
-- Freguês - Migration 055: frete grátis só quando o lojista escolhe
--
-- Antes, taxa de entrega 0 valia ao mesmo tempo como "grátis" e como
-- "combino depois": o cardápio mostrava "Entrega grátis", o pedido saía
-- sem frete e a automação aceitava assim. Agora:
-- 1. establishments.free_delivery: o lojista marca "Entrega grátis" de
--    propósito. Taxa 0 sem marcar = taxa a combinar.
-- 2. orders.shipping_fee_to_confirm: pedido feito com a taxa a combinar.
--    O painel pede a taxa no aceite e a automação não aceita sozinha.
-- 3. Pix automático não é aceito com a taxa a combinar (cobra o valor
--    fechado) e, já pago, a taxa não muda no aceite.
-- Frete grátis por valor mínimo, cupom, fidelidade e bairro com taxa 0
-- continuam como estão (são escolhas do lojista).
-- ============================================================

ALTER TABLE establishments ADD COLUMN IF NOT EXISTS free_delivery BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_fee_to_confirm BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION place_order(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_est_id UUID := (p_payload->>'establishment_id')::uuid;
  e establishments%ROWTYPE;
  v_name TEXT := left(trim(COALESCE(p_payload->>'customer_name', '')), 80);
  v_phone TEXT := left(trim(COALESCE(p_payload->>'customer_phone', '')), 30);
  v_digits TEXT;
  v_token TEXT := p_payload->>'customer_token';
  v_token_ok BOOLEAN := false;
  v_new_token TEXT;
  v_order_type TEXT := COALESCE(p_payload->>'order_type', 'delivery');
  v_items JSONB;
  v_subtotal NUMERIC;
  v_fee NUMERIC := 0;
  v_discount NUMERIC := 0;
  v_discount_source TEXT;
  v_coupon_code TEXT;
  v_reward_id UUID;
  v_points INT := 0;
  v_total NUMERIC;
  v_payment TEXT := NULLIF(p_payload->>'payment_method', '');
  v_payment_status TEXT;
  v_change NUMERIC := NULLIF(p_payload->>'change_for', '')::numeric;
  v_addr JSONB := p_payload->'delivery_address';
  v_neigh delivery_neighborhoods%ROWTYPE;
  v_has_neighborhoods BOOLEAN;
  v_tab_id UUID;
  v_customer customers%ROWTYPE;
  v_customer_has_tokens BOOLEAN;
  v_birth DATE := NULLIF(p_payload->>'birth_date', '')::date;
  v_coupon RECORD;
  v_reward RECORD;
  v_free_shipping BOOLEAN := false;
  v_fee_to_confirm BOOLEAN := false;
  v_local_md TEXT;
  v_order_id UUID := gen_random_uuid();
  v_mp_ok BOOLEAN;
BEGIN
  SELECT * INTO e FROM establishments WHERE id = v_est_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loja não encontrada.';
  END IF;

  IF NOT check_rate_limit('place_order', v_est_id::text || ':' || request_ip(), 15, INTERVAL '5 minutes') THEN
    RAISE EXCEPTION 'Muitos pedidos seguidos deste aparelho. Aguarde alguns minutos.';
  END IF;

  IF establishment_is_blocked(v_est_id) THEN
    RAISE EXCEPTION 'Esta loja não está recebendo pedidos online no momento.';
  END IF;
  IF NOT establishment_is_open_now(v_est_id) THEN
    RAISE EXCEPTION 'A loja está fechada agora. Confira o horário de funcionamento.';
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'Informe seu nome.';
  END IF;
  v_digits := phone_digits(v_phone);

  IF v_order_type NOT IN ('delivery', 'pickup', 'mesa') THEN
    RAISE EXCEPTION 'Tipo de pedido inválido.';
  END IF;
  IF v_order_type <> 'mesa' AND (length(v_digits) < 10 OR length(v_digits) > 13) THEN
    RAISE EXCEPTION 'Informe um telefone com DDD.';
  END IF;
  IF v_order_type = 'mesa' AND v_digits <> '' AND length(v_digits) < 10 THEN
    RAISE EXCEPTION 'Telefone inválido.';
  END IF;
  IF v_order_type = 'delivery' AND NOT COALESCE(e.offers_delivery, true) THEN
    RAISE EXCEPTION 'Esta loja não faz entrega.';
  END IF;
  IF v_order_type = 'pickup' AND NOT COALESCE(e.offers_pickup, true) THEN
    RAISE EXCEPTION 'Esta loja não oferece retirada.';
  END IF;

  IF v_order_type = 'mesa' THEN
    SELECT tab_id INTO v_tab_id FROM get_or_create_table_tab(v_est_id, (p_payload->>'table_id')::uuid);
    IF v_tab_id IS NULL THEN
      RAISE EXCEPTION 'Mesa indisponível no momento.';
    END IF;
  END IF;

  v_items := price_order_items(v_est_id, p_payload->'items');
  SELECT round(COALESCE(SUM((i->>'total_price')::numeric), 0), 2) INTO v_subtotal FROM jsonb_array_elements(v_items) i;

  IF v_order_type <> 'mesa' AND e.min_order_value IS NOT NULL AND v_subtotal < e.min_order_value THEN
    RAISE EXCEPTION 'O pedido mínimo desta loja é R$ %.', to_char(e.min_order_value, 'FM999990D00');
  END IF;

  -- Entrega e frete
  IF v_order_type = 'delivery' THEN
    IF v_addr IS NULL OR COALESCE(trim(v_addr->>'street'), '') = '' OR COALESCE(trim(v_addr->>'number'), '') = '' THEN
      RAISE EXCEPTION 'Informe rua e número para a entrega.';
    END IF;
    SELECT EXISTS (SELECT 1 FROM delivery_neighborhoods WHERE establishment_id = v_est_id AND is_active = true) INTO v_has_neighborhoods;
    IF COALESCE(e.use_neighborhood_delivery_fee, false) AND v_has_neighborhoods THEN
      SELECT * INTO v_neigh FROM delivery_neighborhoods
      WHERE id = NULLIF(v_addr->>'neighborhood_id', '')::uuid AND establishment_id = v_est_id AND is_active = true;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Escolha um bairro atendido pela loja.';
      END IF;
      v_fee := v_neigh.fee;
      v_addr := v_addr || jsonb_build_object('neighborhood', v_neigh.name);
    ELSE
      IF COALESCE(trim(v_addr->>'neighborhood'), '') = '' THEN
        RAISE EXCEPTION 'Informe o bairro.';
      END IF;
      -- Taxa geral: cobra se tiver valor; grátis só se o lojista marcou
      -- "Entrega grátis"; 0 sem marcar é "a combinar" (definida no aceite).
      IF COALESCE(e.delivery_fee, 0) > 0 THEN
        v_fee := e.delivery_fee;
      ELSE
        v_fee := 0;
        v_fee_to_confirm := NOT COALESCE(e.free_delivery, false);
      END IF;
    END IF;
    IF COALESCE(e.free_shipping_threshold, 0) > 0 AND v_subtotal >= e.free_shipping_threshold THEN
      v_fee := 0;
      v_fee_to_confirm := false;
    END IF;
    v_addr := jsonb_build_object(
      'street', left(trim(v_addr->>'street'), 120),
      'number', left(trim(v_addr->>'number'), 20),
      'neighborhood', left(trim(v_addr->>'neighborhood'), 80),
      'complement', NULLIF(left(trim(COALESCE(v_addr->>'complement', '')), 80), ''),
      'reference', NULLIF(left(trim(COALESCE(v_addr->>'reference', '')), 120), ''),
      'zip_code', NULLIF(left(trim(COALESCE(v_addr->>'zip_code', '')), 10), ''),
      'neighborhood_id', NULLIF(v_addr->>'neighborhood_id', '')
    );
  ELSE
    v_addr := NULL;
  END IF;

  -- Cliente: perfil, token do aparelho
  IF v_digits <> '' THEN
    v_token_ok := customer_token_valid(v_est_id, v_digits, v_token);
    SELECT * INTO v_customer FROM customers WHERE establishment_id = v_est_id AND phone = v_digits;
    SELECT EXISTS (SELECT 1 FROM customer_tokens WHERE establishment_id = v_est_id AND phone = v_digits) INTO v_customer_has_tokens;

    IF v_customer.id IS NULL THEN
      INSERT INTO customers (establishment_id, phone, name, birth_date, birth_date_set_at)
      VALUES (v_est_id, v_digits, v_name, v_birth, CASE WHEN v_birth IS NOT NULL THEN now() END)
      RETURNING * INTO v_customer;
      v_new_token := issue_customer_token(v_est_id, v_digits);
      v_token_ok := true;
    ELSIF v_token_ok OR NOT v_customer_has_tokens THEN
      -- Aparelho já verificado, ou primeiro aparelho a reivindicar um
      -- cliente antigo (de antes desta migration).
      IF NOT v_token_ok THEN
        v_new_token := issue_customer_token(v_est_id, v_digits);
        v_token_ok := true;
      END IF;
      UPDATE customers SET
        name = v_name,
        birth_date = CASE WHEN v_birth IS NOT NULL AND birth_date IS DISTINCT FROM v_birth THEN v_birth ELSE birth_date END,
        birth_date_set_at = CASE WHEN v_birth IS NOT NULL AND birth_date IS DISTINCT FROM v_birth THEN now() ELSE birth_date_set_at END,
        updated_at = now()
      WHERE id = v_customer.id
      RETURNING * INTO v_customer;
    END IF;
  END IF;

  -- Desconto (um só por pedido)
  IF NULLIF(trim(COALESCE(p_payload->>'coupon_code', '')), '') IS NOT NULL THEN
    SELECT * INTO v_coupon FROM validate_coupon(v_est_id, p_payload->>'coupon_code', v_phone);
    IF NOT v_coupon.valid THEN
      RAISE EXCEPTION '%', v_coupon.message;
    END IF;
    v_coupon_code := upper(trim(p_payload->>'coupon_code'));
    IF v_coupon.discount_type = 'percent' THEN
      v_discount := v_subtotal * v_coupon.discount_value / 100;
    ELSIF v_coupon.discount_type = 'fixed' THEN
      v_discount := LEAST(v_coupon.discount_value, v_subtotal);
    ELSE
      v_free_shipping := true;
    END IF;
    v_discount_source := 'coupon';
  ELSIF NULLIF(p_payload->>'reward_id', '') IS NOT NULL THEN
    IF NOT v_token_ok THEN
      RAISE EXCEPTION 'Confirme seu telefone para usar seus pontos neste aparelho.';
    END IF;
    v_reward_id := (p_payload->>'reward_id')::uuid;
    SELECT * INTO v_reward FROM validate_loyalty_redemption(v_est_id, v_reward_id, v_phone);
    IF NOT v_reward.valid THEN
      RAISE EXCEPTION '%', v_reward.message;
    END IF;
    IF v_reward.benefit_type = 'percent_discount' THEN
      v_discount := v_subtotal * COALESCE(v_reward.benefit_value, 0) / 100;
    ELSIF v_reward.benefit_type = 'fixed_discount' THEN
      v_discount := LEAST(COALESCE(v_reward.benefit_value, 0), v_subtotal);
    ELSE
      v_free_shipping := true;
    END IF;
    v_points := v_reward.points_cost;
    v_discount_source := 'loyalty';
  ELSIF COALESCE((p_payload->>'use_birthday')::boolean, false) AND COALESCE(e.birthday_discount_percent, 0) > 0
        AND v_customer.id IS NOT NULL AND v_customer.birth_date IS NOT NULL THEN
    v_local_md := to_char(now() AT TIME ZONE COALESCE(NULLIF(e.timezone, ''), 'America/Sao_Paulo'), 'MM-DD');
    -- Data informada há pelo menos 30 dias: não vale "digitar hoje".
    IF to_char(v_customer.birth_date, 'MM-DD') = v_local_md
       AND v_customer.birth_date_set_at IS NOT NULL AND v_customer.birth_date_set_at <= now() - INTERVAL '30 days'
       AND NOT EXISTS (
         SELECT 1 FROM orders o WHERE o.establishment_id = v_est_id AND o.discount_source = 'birthday'
           AND phone_digits(o.customer_phone) = v_digits AND o.status <> 'cancelled'
           AND o.created_at > now() - INTERVAL '300 days'
       ) THEN
      v_discount := v_subtotal * e.birthday_discount_percent / 100;
      v_discount_source := 'birthday';
    END IF;
  END IF;

  IF v_free_shipping THEN
    v_fee := 0;
    v_fee_to_confirm := false;
  END IF;
  v_discount := round(v_discount, 2);
  v_fee := round(v_fee, 2);
  v_total := round(GREATEST(0, v_subtotal - v_discount + v_fee), 2);

  -- Pagamento
  IF v_order_type = 'mesa' THEN
    v_payment := NULL;
  ELSIF v_payment IS NOT NULL AND v_payment NOT IN ('dinheiro', 'pix', 'mercadopago_pix', 'cartao_credito', 'cartao_debito', 'outro') THEN
    RAISE EXCEPTION 'Forma de pagamento inválida.';
  END IF;
  IF v_payment = 'mercadopago_pix' THEN
    SELECT EXISTS (SELECT 1 FROM mercadopago_accounts ma WHERE ma.establishment_id = v_est_id AND ma.is_active = true)
           AND e.billing_mode = 'comissao' AND establishment_has_completo_access(v_est_id)
    INTO v_mp_ok;
    IF NOT v_mp_ok THEN
      RAISE EXCEPTION 'Pix automático não está disponível nesta loja.';
    END IF;
    IF v_total < 5 THEN
      RAISE EXCEPTION 'Pix automático exige pedido de no mínimo R$ 5,00.';
    END IF;
    IF v_fee_to_confirm THEN
      RAISE EXCEPTION 'A taxa de entrega desta loja é combinada depois. Escolha outra forma de pagamento.';
    END IF;
    v_payment_status := 'pending';
  END IF;
  IF v_payment = 'dinheiro' AND v_change IS NOT NULL THEN
    IF v_change < v_total THEN
      RAISE EXCEPTION 'O valor para troco precisa ser maior que o total do pedido.';
    END IF;
  ELSE
    v_change := NULL;
  END IF;

  INSERT INTO orders (
    id, establishment_id, customer_name, customer_phone, items, subtotal, shipping_fee, discount, total,
    status, source, order_type, delivery_address, payment_method, payment_status, notes,
    coupon_code, loyalty_reward_id, loyalty_points_redeemed, table_tab_id, change_for, discount_source, priced_by_server,
    shipping_fee_to_confirm
  ) VALUES (
    v_order_id, v_est_id, v_name, v_phone, v_items, v_subtotal, v_fee, v_discount, v_total,
    'pending', CASE WHEN v_order_type = 'mesa' THEN 'mesa' ELSE 'online' END, v_order_type, v_addr, v_payment, v_payment_status,
    NULLIF(left(trim(COALESCE(p_payload->>'notes', '')), 500), ''),
    v_coupon_code, v_reward_id, v_points, v_tab_id, v_change, v_discount_source, true,
    v_fee_to_confirm
  );

  -- Endereço salvo no perfil (só para aparelho verificado)
  IF v_order_type = 'delivery' AND v_token_ok AND v_customer.id IS NOT NULL
     AND COALESCE((p_payload->>'save_address')::boolean, true) THEN
    IF NOT EXISTS (
      SELECT 1 FROM customer_addresses
      WHERE customer_id = v_customer.id AND lower(street) = lower(v_addr->>'street') AND lower(number) = lower(v_addr->>'number')
    ) THEN
      INSERT INTO customer_addresses (customer_id, label, street, number, neighborhood, complement, reference, zip_code)
      VALUES (v_customer.id, COALESCE(NULLIF(left(trim(COALESCE(p_payload->>'address_label', '')), 40), ''), 'Principal'),
              v_addr->>'street', v_addr->>'number', v_addr->>'neighborhood', v_addr->>'complement', v_addr->>'reference', v_addr->>'zip_code');
    ELSE
      UPDATE customer_addresses SET updated_at = now(), neighborhood = v_addr->>'neighborhood',
        complement = v_addr->>'complement', reference = v_addr->>'reference', zip_code = v_addr->>'zip_code'
      WHERE customer_id = v_customer.id AND lower(street) = lower(v_addr->>'street') AND lower(number) = lower(v_addr->>'number');
    END IF;
  END IF;

  IF v_digits <> '' THEN
    UPDATE cart_drafts SET recovered_at = now()
    WHERE establishment_id = v_est_id AND customer_phone = v_digits AND recovered_at IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'shipping_fee', v_fee,
    'shipping_fee_to_confirm', v_fee_to_confirm,
    'total', v_total,
    'items', v_items,
    'customer_token', v_new_token
  );
END;
$$;

CREATE OR REPLACE FUNCTION accept_order(
  p_order_id UUID,
  p_new_status TEXT DEFAULT 'confirmed',
  p_shipping_fee NUMERIC DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL,
  p_eta_minutes INT DEFAULT NULL
)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o orders%ROWTYPE;
  v_fee NUMERIC;
BEGIN
  o := assert_order_owner(p_order_id);
  IF o.status <> 'pending' THEN
    RAISE EXCEPTION 'Este pedido já foi atualizado. Recarregue a tela.';
  END IF;
  IF p_new_status NOT IN ('confirmed', 'completed') THEN
    RAISE EXCEPTION 'Status inválido para aceite.';
  END IF;
  IF o.payment_method = 'mercadopago_pix' AND o.payment_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'O Pix automático deste pedido ainda não foi pago. Aguarde a confirmação.';
  END IF;

  IF o.shipping_fee_to_confirm AND p_shipping_fee IS NULL AND o.order_type = 'delivery' THEN
    RAISE EXCEPTION 'Informe a taxa de entrega: este pedido foi feito com a taxa a combinar (digite 0 para não cobrar).';
  END IF;
  v_fee := COALESCE(p_shipping_fee, o.shipping_fee, 0);
  -- Pix automático já foi pago com o total fechado: a taxa não muda.
  IF o.payment_method = 'mercadopago_pix' THEN
    v_fee := COALESCE(o.shipping_fee, 0);
  END IF;
  IF v_fee < 0 THEN
    RAISE EXCEPTION 'Taxa de entrega inválida.';
  END IF;

  UPDATE orders SET
    status = p_new_status,
    shipping_fee = round(v_fee, 2),
    shipping_fee_to_confirm = false,
    total = round(GREATEST(0, subtotal - COALESCE(discount, 0) + v_fee), 2),
    payment_method = CASE
      WHEN o.payment_method = 'mercadopago_pix' THEN o.payment_method
      ELSE COALESCE(NULLIF(p_payment_method, ''), o.payment_method)
    END,
    eta_minutes = COALESCE(p_eta_minutes, eta_minutes)
  WHERE id = o.id
  RETURNING * INTO o;

  PERFORM apply_first_acceptance(o);
  RETURN o;
END;
$$;

CREATE OR REPLACE FUNCTION service_accept_order(p_order_id UUID, p_new_status TEXT)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.status <> 'pending' THEN
    RETURN NULL;
  END IF;
  IF o.payment_method = 'mercadopago_pix' AND o.payment_status IS DISTINCT FROM 'approved' THEN
    RETURN NULL;
  END IF;
  -- Taxa a combinar: só o lojista aceita (senão sairia sem frete).
  IF o.shipping_fee_to_confirm THEN
    RETURN NULL;
  END IF;
  UPDATE orders SET status = p_new_status WHERE id = o.id RETURNING * INTO o;
  PERFORM apply_first_acceptance(o);
  RETURN o;
END;
$$;

REVOKE EXECUTE ON FUNCTION service_accept_order(UUID, TEXT) FROM PUBLIC, anon, authenticated;

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
  e.google_review_url,
  e.free_delivery
FROM establishments e;

GRANT SELECT ON public_establishments TO anon, authenticated;

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
  establishment_id UUID,
  shipping_fee_to_confirm BOOLEAN
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
         e.whatsapp_number, e.logo_url, e.google_review_url, o.customer_rating, e.id,
         o.shipping_fee_to_confirm
  FROM orders o
  JOIN establishments e ON e.id = o.establishment_id
  WHERE o.id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_order_status(UUID) TO anon, authenticated;
