-- ============================================================
-- Migration 045 -- pedido seguro e dados do cliente protegidos
-- (rodar DEPOIS da 044 e ANTES do deploy do app novo).
--
-- Pode rodar com o app antigo ainda no ar: as funções novas convivem com
-- as antigas (assinaturas diferentes) e a inserção direta de pedidos
-- continua aberta até a 046. A 046 fecha o acesso antigo e deve rodar
-- logo DEPOIS que o deploy do app novo estiver no ar.
--
-- Antes: o navegador montava o pedido inteiro (preço, desconto, status,
-- pagamento) e o banco aceitava qualquer INSERT anônimo
-- (orders_insert_public WITH CHECK true). Dava para gravar pedido
-- "pago", "concluído" ou com total de R$ 0,01, ganhar pontos sem
-- comprar e inundar a loja de pedidos falsos.
--
-- Agora:
-- 1. place_order(): única porta de entrada do cardápio público. Recebe
--    só ids e quantidades, recalcula tudo pelo banco, valida loja
--    aberta, assinatura, estoque, cupom, pontos e aniversário, e grava
--    numa transação.
-- 2. Token do cliente por aparelho: perfil, endereços, histórico,
--    resgate de pontos e exclusão de dados exigem o token (ou um código
--    de verificação enviado pelo WhatsApp da loja).
-- 3. accept_order / advance_order / cancel_order / balcao_sale:
--    pedido, estoque e financeiro mudam juntos, numa transação.
-- 4. Comissão de R$ 1 do Mercado Pago só em pedido Pix automático pago.
-- 5. Lançamentos financeiros de pedidos não podem ser apagados à mão.
-- 6. error_logs com limite por IP.
-- ============================================================

-- ------------------------------------------------------------
-- AUXILIARES
-- ------------------------------------------------------------

-- IP de quem chamou (PostgREST expõe os headers da requisição).
CREATE OR REPLACE FUNCTION request_ip()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_headers JSON;
BEGIN
  BEGIN
    v_headers := NULLIF(current_setting('request.headers', true), '')::json;
  EXCEPTION WHEN others THEN
    v_headers := NULL;
  END;
  RETURN COALESCE(
    NULLIF(trim(split_part(v_headers->>'x-forwarded-for', ',', 1)), ''),
    NULLIF(v_headers->>'x-real-ip', ''),
    'sem-ip'
  );
END;
$$;

CREATE OR REPLACE FUNCTION phone_digits(p_phone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$ SELECT regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g') $$;

-- Mesma regra de get_my_subscription_status, por loja.
CREATE OR REPLACE FUNCTION establishment_is_blocked(p_establishment_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e establishments%ROWTYPE;
  v_billing_enabled BOOLEAN;
BEGIN
  SELECT * INTO e FROM establishments WHERE id = p_establishment_id;
  IF NOT FOUND THEN
    RETURN true;
  END IF;
  SELECT ps.billing_enabled INTO v_billing_enabled FROM platform_settings ps LIMIT 1;
  IF NOT COALESCE(v_billing_enabled, false) OR e.subscription_status = 'exempt' THEN
    RETURN false;
  END IF;
  IF e.subscription_status = 'active' THEN
    RETURN e.current_period_end IS NOT NULL AND e.current_period_end < now();
  END IF;
  RETURN e.trial_ends_at IS NOT NULL AND e.trial_ends_at < now();
END;
$$;

-- Loja aberta agora: chave manual, pausa temporária e horário do dia no
-- fuso da loja (dia sem horário configurado não fecha a loja).
CREATE OR REPLACE FUNCTION establishment_is_open_now(p_establishment_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e establishments%ROWTYPE;
  v_local TIMESTAMP;
  v_day TEXT;
  v_hours JSONB;
  v_open INT;
  v_close INT;
  v_now INT;
BEGIN
  SELECT * INTO e FROM establishments WHERE id = p_establishment_id;
  IF NOT FOUND OR NOT COALESCE(e.is_open, true) THEN
    RETURN false;
  END IF;
  IF e.paused_until IS NOT NULL AND e.paused_until > now() THEN
    RETURN false;
  END IF;
  IF e.opening_hours IS NULL THEN
    RETURN true;
  END IF;

  v_local := now() AT TIME ZONE COALESCE(NULLIF(e.timezone, ''), 'America/Sao_Paulo');
  v_day := (ARRAY['dom','seg','ter','qua','qui','sex','sab'])[extract(dow FROM v_local)::int + 1];
  v_hours := e.opening_hours -> v_day;
  IF v_hours IS NULL OR COALESCE(v_hours->>'open', '') = '' OR COALESCE(v_hours->>'close', '') = '' THEN
    RETURN true;
  END IF;

  BEGIN
    v_open := split_part(v_hours->>'open', ':', 1)::int * 60 + split_part(v_hours->>'open', ':', 2)::int;
    v_close := split_part(v_hours->>'close', ':', 1)::int * 60 + split_part(v_hours->>'close', ':', 2)::int;
  EXCEPTION WHEN others THEN
    RETURN true;
  END;
  v_now := extract(hour FROM v_local)::int * 60 + extract(minute FROM v_local)::int;

  IF v_close <= v_open THEN
    RETURN v_now >= v_open OR v_now < v_close; -- atravessa a meia-noite
  END IF;
  RETURN v_now >= v_open AND v_now < v_close;
END;
$$;

-- ------------------------------------------------------------
-- TOKEN DO CLIENTE (por aparelho) E CÓDIGO DE VERIFICAÇÃO
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE NOT NULL,
  phone TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_customer_tokens_lookup ON customer_tokens(establishment_id, phone);
ALTER TABLE customer_tokens ENABLE ROW LEVEL SECURITY; -- sem policy: só funções abaixo

CREATE TABLE IF NOT EXISTS customer_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE NOT NULL,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_otps_lookup ON customer_otps(establishment_id, phone, created_at DESC);
ALTER TABLE customer_otps ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION hash_secret(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$ SELECT encode(sha256(convert_to(p_value, 'UTF8')), 'hex') $$;

CREATE OR REPLACE FUNCTION issue_customer_token(p_establishment_id UUID, p_phone_digits TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
BEGIN
  INSERT INTO customer_tokens (establishment_id, phone, token_hash)
  VALUES (p_establishment_id, p_phone_digits, hash_secret(v_token));
  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION customer_token_valid(p_establishment_id UUID, p_phone_digits TEXT, p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 OR p_phone_digits = '' THEN
    RETURN false;
  END IF;
  UPDATE customer_tokens SET last_used_at = now()
  WHERE establishment_id = p_establishment_id AND phone = p_phone_digits AND token_hash = hash_secret(p_token)
  RETURNING id INTO v_id;
  RETURN v_id IS NOT NULL;
END;
$$;

-- Chamada só pelo servidor (service role), que envia o código pelo
-- WhatsApp da loja (app/api/customer/otp).
CREATE OR REPLACE FUNCTION create_customer_otp(p_establishment_id UUID, p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits TEXT := phone_digits(p_phone);
  v_code TEXT := lpad((floor(random() * 1000000))::int::text, 6, '0');
BEGIN
  IF length(v_digits) < 10 THEN
    RAISE EXCEPTION 'Telefone inválido.';
  END IF;
  IF NOT check_rate_limit('create_customer_otp', p_establishment_id::text || ':' || v_digits, 3, INTERVAL '10 minutes') THEN
    RAISE EXCEPTION 'Muitos códigos pedidos. Aguarde alguns minutos.';
  END IF;
  INSERT INTO customer_otps (establishment_id, phone, code_hash, expires_at)
  VALUES (p_establishment_id, v_digits, hash_secret(v_code), now() + INTERVAL '10 minutes');
  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION verify_customer_otp(p_establishment_id UUID, p_phone TEXT, p_code TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits TEXT := phone_digits(p_phone);
  v_otp customer_otps%ROWTYPE;
BEGIN
  IF NOT check_rate_limit('verify_customer_otp', request_ip(), 20, INTERVAL '10 minutes') THEN
    RAISE EXCEPTION 'Muitas tentativas. Aguarde alguns minutos.';
  END IF;

  SELECT * INTO v_otp FROM customer_otps
  WHERE establishment_id = p_establishment_id AND phone = v_digits AND expires_at > now()
  ORDER BY created_at DESC LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Código expirado. Peça um novo.';
  END IF;
  IF v_otp.attempts >= 5 THEN
    RAISE EXCEPTION 'Muitas tentativas com este código. Peça um novo.';
  END IF;
  IF v_otp.code_hash <> hash_secret(trim(COALESCE(p_code, ''))) THEN
    UPDATE customer_otps SET attempts = attempts + 1 WHERE id = v_otp.id;
    RAISE EXCEPTION 'Código incorreto.';
  END IF;

  DELETE FROM customer_otps WHERE establishment_id = p_establishment_id AND phone = v_digits;
  RETURN issue_customer_token(p_establishment_id, v_digits);
END;
$$;

-- Lojista pode desconectar todos os aparelhos de um cliente (ex: cliente
-- relatou que outra pessoa usou o telefone dele).
CREATE OR REPLACE FUNCTION revoke_customer_tokens(p_customer_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c customers%ROWTYPE;
BEGIN
  SELECT * INTO c FROM customers WHERE id = p_customer_id;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM establishments WHERE id = c.establishment_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Cliente não encontrado.';
  END IF;
  DELETE FROM customer_tokens WHERE establishment_id = c.establishment_id AND phone = c.phone;
END;
$$;

-- ------------------------------------------------------------
-- PREÇO DOS ITENS (sempre pelo banco)
-- Formato de cada item recebido:
--   {kind:'product', product_id, quantity, option_ids:[], note}
--   {kind:'pizza', product_id, quantity, size_id, flavor_ids:[], additional_ids:[], note}
--   {kind:'combo', combo_id, quantity, selections:[{group_id, product_id}], note}
-- Devolve os itens já no formato que o painel/recibo/WhatsApp usam.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION price_order_items(p_establishment_id UUID, p_items JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_kind TEXT;
  v_qty INT;
  v_note TEXT;
  v_product products%ROWTYPE;
  v_combo combos%ROWTYPE;
  v_size pizza_sizes%ROWTYPE;
  v_group RECORD;
  v_option_ids UUID[];
  v_flavor_ids UUID[];
  v_additional_ids UUID[];
  v_count INT;
  v_unit NUMERIC;
  v_variations JSONB;
  v_selections JSONB;
  v_sel_product products%ROWTYPE;
  v_sel_product_id UUID;
  v_own_category TEXT;
  v_result JSONB := '[]'::jsonb;
  v_out JSONB;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Seu carrinho está vazio.';
  END IF;
  IF jsonb_array_length(p_items) > 60 THEN
    RAISE EXCEPTION 'Pedido com itens demais.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_kind := COALESCE(v_item->>'kind', 'product');
    v_qty := COALESCE((v_item->>'quantity')::int, 0);
    IF v_qty < 1 OR v_qty > 99 THEN
      RAISE EXCEPTION 'Quantidade inválida.';
    END IF;
    v_note := NULLIF(left(trim(COALESCE(v_item->>'note', '')), 200), '');
    v_variations := '[]'::jsonb;
    v_selections := NULL;

    IF v_kind = 'combo' THEN
      SELECT * INTO v_combo FROM combos
      WHERE id = (v_item->>'combo_id')::uuid AND establishment_id = p_establishment_id AND is_active = true;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Um combo do carrinho não está mais disponível.';
      END IF;
      v_selections := '[]'::jsonb;
      FOR v_group IN SELECT * FROM combo_groups WHERE combo_id = v_combo.id ORDER BY display_order, created_at LOOP
        SELECT (s->>'product_id')::uuid INTO v_sel_product_id
        FROM jsonb_array_elements(COALESCE(v_item->'selections', '[]'::jsonb)) s
        WHERE (s->>'group_id')::uuid = v_group.id
        LIMIT 1;
        IF v_sel_product_id IS NULL OR NOT EXISTS (
          SELECT 1 FROM combo_group_products WHERE combo_group_id = v_group.id AND product_id = v_sel_product_id
        ) THEN
          RAISE EXCEPTION 'Escolha uma opção em "%" do combo %.', v_group.name, v_combo.name;
        END IF;
        SELECT * INTO v_sel_product FROM products WHERE id = v_sel_product_id AND is_active = true;
        IF NOT FOUND
           OR (v_sel_product.track_stock AND v_sel_product.stock_qty < v_qty)
           OR (v_sel_product.sold_out_until IS NOT NULL AND v_sel_product.sold_out_until > now()) THEN
          RAISE EXCEPTION '% está esgotado no momento.', COALESCE(v_sel_product.name, 'Um item do combo');
        END IF;
        v_variations := v_variations || jsonb_build_object('group_name', v_group.name, 'option_name', v_sel_product.name, 'price_delta', 0);
        v_selections := v_selections || jsonb_build_object('group_id', v_group.id, 'group_name', v_group.name, 'product_id', v_sel_product.id, 'product_name', v_sel_product.name);
        v_sel_product_id := NULL;
      END LOOP;
      v_unit := v_combo.price;
      v_out := jsonb_build_object(
        'product_id', v_combo.id, 'product_name', v_combo.name, 'image_url', v_combo.image_url,
        'combo_id', v_combo.id, 'combo_selections', v_selections
      );

    ELSE
      SELECT * INTO v_product FROM products
      WHERE id = (v_item->>'product_id')::uuid AND establishment_id = p_establishment_id AND is_active = true;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Um produto do carrinho não está mais disponível. Atualize a página.';
      END IF;
      IF (v_product.track_stock AND v_product.stock_qty < v_qty)
         OR (v_product.sold_out_until IS NOT NULL AND v_product.sold_out_until > now()) THEN
        RAISE EXCEPTION '% está esgotado ou sem estoque suficiente.', v_product.name;
      END IF;

      IF v_kind = 'pizza' THEN
        IF v_product.pizza_flavor_id IS NULL THEN
          RAISE EXCEPTION '% não é uma pizza.', v_product.name;
        END IF;
        SELECT * INTO v_size FROM pizza_sizes
        WHERE id = (v_item->>'size_id')::uuid AND establishment_id = p_establishment_id AND is_active = true;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Escolha um tamanho para %.', v_product.name;
        END IF;

        SELECT COALESCE(array_agg(DISTINCT x::uuid), ARRAY[]::uuid[]) INTO v_flavor_ids
        FROM jsonb_array_elements_text(COALESCE(v_item->'flavor_ids', '[]'::jsonb)) x;
        IF NOT (v_product.pizza_flavor_id = ANY(v_flavor_ids)) THEN
          v_flavor_ids := array_prepend(v_product.pizza_flavor_id, v_flavor_ids);
        END IF;
        v_count := cardinality(v_flavor_ids);
        IF v_count > v_size.max_flavors THEN
          RAISE EXCEPTION 'O tamanho % aceita até % sabor(es).', v_size.name, v_size.max_flavors;
        END IF;
        SELECT category INTO v_own_category FROM pizza_flavors WHERE id = v_product.pizza_flavor_id;
        SELECT COUNT(*) INTO v_count FROM pizza_flavors
        WHERE id = ANY(v_flavor_ids) AND establishment_id = p_establishment_id AND is_active = true
          AND (v_own_category IS NULL OR category IS NULL OR category = v_own_category);
        IF v_count <> cardinality(v_flavor_ids) THEN
          RAISE EXCEPTION 'Combinação de sabores inválida para %.', v_product.name;
        END IF;

        SELECT COALESCE(array_agg(DISTINCT x::uuid), ARRAY[]::uuid[]) INTO v_additional_ids
        FROM jsonb_array_elements_text(COALESCE(v_item->'additional_ids', '[]'::jsonb)) x;
        SELECT COUNT(*) INTO v_count FROM pizza_additionals
        WHERE id = ANY(v_additional_ids) AND establishment_id = p_establishment_id AND is_active = true;
        IF v_count <> cardinality(v_additional_ids) THEN
          RAISE EXCEPTION 'Um adicional escolhido não está mais disponível.';
        END IF;

        -- Meio a meio: vale o sabor mais caro; adicionais somam.
        SELECT MAX(v_size.base_price + COALESCE(fp.price_delta, 0)) INTO v_unit
        FROM unnest(v_flavor_ids) f(id)
        LEFT JOIN pizza_flavor_prices fp ON fp.flavor_id = f.id AND fp.size_id = v_size.id;
        v_unit := v_unit + COALESCE((
          SELECT SUM(COALESCE(ap.price, 0))
          FROM unnest(v_additional_ids) a(id)
          LEFT JOIN pizza_additional_prices ap ON ap.additional_id = a.id AND ap.size_id = v_size.id
        ), 0);

        v_variations := jsonb_build_array(jsonb_build_object('group_name', 'Tamanho', 'option_name', v_size.name, 'price_delta', 0));
        IF cardinality(v_flavor_ids) > 1 THEN
          SELECT v_variations || COALESCE(jsonb_agg(jsonb_build_object(
                   'group_name', 'Sabor (' || ord || '/' || cardinality(v_flavor_ids) || ')',
                   'option_name', pf.name, 'price_delta', 0) ORDER BY ord), '[]'::jsonb)
          INTO v_variations
          FROM unnest(v_flavor_ids) WITH ORDINALITY f(id, ord)
          JOIN pizza_flavors pf ON pf.id = f.id;
        END IF;
        SELECT v_variations || COALESCE(jsonb_agg(jsonb_build_object(
                 'group_name', 'Adicional', 'option_name', pa.name, 'price_delta', COALESCE(ap.price, 0)) ORDER BY pa.display_order), '[]'::jsonb)
        INTO v_variations
        FROM pizza_additionals pa
        LEFT JOIN pizza_additional_prices ap ON ap.additional_id = pa.id AND ap.size_id = v_size.id
        WHERE pa.id = ANY(v_additional_ids);

      ELSE
        IF v_product.pizza_flavor_id IS NOT NULL THEN
          RAISE EXCEPTION 'Escolha o tamanho da pizza %.', v_product.name;
        END IF;
        SELECT COALESCE(array_agg(DISTINCT x::uuid), ARRAY[]::uuid[]) INTO v_option_ids
        FROM jsonb_array_elements_text(COALESCE(v_item->'option_ids', '[]'::jsonb)) x;

        -- Toda opção precisa ser deste produto.
        SELECT COUNT(*) INTO v_count FROM variation_options vo
        JOIN variation_groups vg ON vg.id = vo.variation_group_id
        WHERE vo.id = ANY(v_option_ids) AND vg.product_id = v_product.id;
        IF v_count <> cardinality(v_option_ids) THEN
          RAISE EXCEPTION 'Uma opção escolhida em % não existe mais. Monte o item de novo.', v_product.name;
        END IF;

        FOR v_group IN SELECT * FROM variation_groups WHERE product_id = v_product.id ORDER BY display_order LOOP
          SELECT COUNT(*) INTO v_count FROM variation_options WHERE variation_group_id = v_group.id AND id = ANY(v_option_ids);
          IF v_group.is_required AND v_count = 0 THEN
            RAISE EXCEPTION 'Escolha uma opção em "%" para %.', v_group.name, v_product.name;
          END IF;
          IF NOT v_group.allow_multiple AND v_count > 1 THEN
            RAISE EXCEPTION 'Escolha só uma opção em "%".', v_group.name;
          END IF;
          IF v_group.max_select IS NOT NULL AND v_count > v_group.max_select THEN
            RAISE EXCEPTION 'Escolha até % opção(ões) em "%".', v_group.max_select, v_group.name;
          END IF;
        END LOOP;

        SELECT COALESCE(jsonb_agg(jsonb_build_object('group_name', vg.name, 'option_name', vo.name, 'price_delta', COALESCE(vo.price_delta, 0))
                 ORDER BY vg.display_order, vo.display_order), '[]'::jsonb),
               v_product.price + COALESCE(SUM(COALESCE(vo.price_delta, 0)), 0)
        INTO v_variations, v_unit
        FROM variation_options vo
        JOIN variation_groups vg ON vg.id = vo.variation_group_id
        WHERE vo.id = ANY(v_option_ids);
        IF v_unit IS NULL THEN
          v_unit := v_product.price;
        END IF;
      END IF;

      v_out := jsonb_build_object('product_id', v_product.id, 'product_name', v_product.name, 'image_url', v_product.image_url, 'combo_id', NULL);
    END IF;

    v_unit := round(v_unit, 2);
    v_result := v_result || (v_out || jsonb_build_object(
      'quantity', v_qty,
      'unit_price', v_unit,
      'total_price', round(v_unit * v_qty, 2),
      'variations', v_variations,
      'note', v_note,
      -- Guardado para "pedir de novo": o mesmo pedido, montado pelos ids.
      'config', v_item - 'note' - 'quantity'
    ));
  END LOOP;

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------
-- PLACE_ORDER
-- ------------------------------------------------------------
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
      v_fee := COALESCE(e.delivery_fee, 0);
    END IF;
    IF COALESCE(e.free_shipping_threshold, 0) > 0 AND v_subtotal >= e.free_shipping_threshold THEN
      v_fee := 0;
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
    coupon_code, loyalty_reward_id, loyalty_points_redeemed, table_tab_id, change_for, discount_source, priced_by_server
  ) VALUES (
    v_order_id, v_est_id, v_name, v_phone, v_items, v_subtotal, v_fee, v_discount, v_total,
    'pending', CASE WHEN v_order_type = 'mesa' THEN 'mesa' ELSE 'online' END, v_order_type, v_addr, v_payment, v_payment_status,
    NULLIF(left(trim(COALESCE(p_payload->>'notes', '')), 500), ''),
    v_coupon_code, v_reward_id, v_points, v_tab_id, v_change, v_discount_source, true
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
    'total', v_total,
    'items', v_items,
    'customer_token', v_new_token
  );
END;
$$;

-- Prévia do total sem gravar nada (carrinho mostra o mesmo número que o
-- servidor vai cobrar, inclusive se um preço mudou).
CREATE OR REPLACE FUNCTION quote_order_items(p_establishment_id UUID, p_items JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT check_rate_limit('quote_order_items', request_ip(), 120, INTERVAL '1 minute') THEN
    RAISE EXCEPTION 'Muitas consultas em pouco tempo.';
  END IF;
  RETURN price_order_items(p_establishment_id, p_items);
END;
$$;

-- ------------------------------------------------------------
-- FUNÇÕES PÚBLICAS DO CLIENTE (agora com token)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_customer_profile(p_establishment_id UUID, p_phone TEXT, p_token TEXT)
RETURNS TABLE(customer_id UUID, name TEXT, birth_date DATE, loyalty_points_balance INT, addresses JSONB, verified BOOLEAN, has_profile BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits TEXT := phone_digits(p_phone);
  c customers%ROWTYPE;
BEGIN
  IF NOT check_rate_limit('get_customer_profile', p_establishment_id::text || ':' || request_ip(), 30, INTERVAL '1 minute') THEN
    RAISE EXCEPTION 'Muitas consultas em pouco tempo. Aguarde um instante e tente novamente.';
  END IF;
  IF length(v_digits) < 10 THEN
    RETURN;
  END IF;

  SELECT * INTO c FROM customers WHERE establishment_id = p_establishment_id AND phone = v_digits;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT customer_token_valid(p_establishment_id, v_digits, p_token) THEN
    -- Sem prova de que o telefone é de quem está no aparelho: só diz
    -- que existe um cadastro, sem nenhum dado pessoal.
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::date, NULL::int, '[]'::jsonb, false, true;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    c.id, c.name, c.birth_date, c.loyalty_points_balance,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'label', a.label, 'street', a.street, 'number', a.number,
        'neighborhood', a.neighborhood, 'complement', a.complement,
        'reference', a.reference, 'zip_code', a.zip_code
      ) ORDER BY a.updated_at DESC)
      FROM customer_addresses a WHERE a.customer_id = c.id
    ), '[]'::jsonb),
    true, true;
END;
$$;

CREATE OR REPLACE FUNCTION upsert_customer_profile(p_establishment_id UUID, p_phone TEXT, p_name TEXT, p_birth_date DATE, p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits TEXT := phone_digits(p_phone);
  v_id UUID;
BEGIN
  IF NOT customer_token_valid(p_establishment_id, v_digits, p_token) THEN
    RAISE EXCEPTION 'Confirme seu telefone para alterar seus dados.';
  END IF;
  UPDATE customers SET
    name = COALESCE(NULLIF(left(trim(COALESCE(p_name, '')), 80), ''), name),
    birth_date = CASE WHEN p_birth_date IS NOT NULL AND birth_date IS DISTINCT FROM p_birth_date THEN p_birth_date ELSE birth_date END,
    birth_date_set_at = CASE WHEN p_birth_date IS NOT NULL AND birth_date IS DISTINCT FROM p_birth_date THEN now() ELSE birth_date_set_at END,
    updated_at = now()
  WHERE establishment_id = p_establishment_id AND phone = v_digits
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION delete_customer_address(p_establishment_id UUID, p_phone TEXT, p_address_id UUID, p_token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits TEXT := phone_digits(p_phone);
BEGIN
  IF NOT customer_token_valid(p_establishment_id, v_digits, p_token) THEN
    RAISE EXCEPTION 'Confirme seu telefone para alterar seus dados.';
  END IF;
  DELETE FROM customer_addresses a
  USING customers c
  WHERE a.id = p_address_id AND a.customer_id = c.id
    AND c.establishment_id = p_establishment_id AND c.phone = v_digits;
END;
$$;

CREATE OR REPLACE FUNCTION delete_customer_data(p_establishment_id UUID, p_phone TEXT, p_token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits TEXT := phone_digits(p_phone);
BEGIN
  IF NOT customer_token_valid(p_establishment_id, v_digits, p_token) THEN
    RAISE EXCEPTION 'Confirme seu telefone para apagar seus dados.';
  END IF;
  DELETE FROM customers WHERE establishment_id = p_establishment_id AND phone = v_digits;
  DELETE FROM customer_tokens WHERE establishment_id = p_establishment_id AND phone = v_digits;
END;
$$;

CREATE OR REPLACE FUNCTION get_orders_by_phone(p_establishment_id UUID, p_phone TEXT, p_token TEXT)
RETURNS TABLE(id UUID, status TEXT, items JSONB, total NUMERIC, order_type TEXT, source TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits TEXT := phone_digits(p_phone);
BEGIN
  IF NOT check_rate_limit('get_orders_by_phone', p_establishment_id::text || ':' || request_ip(), 30, INTERVAL '1 minute') THEN
    RAISE EXCEPTION 'Muitas consultas em pouco tempo. Aguarde um instante e tente novamente.';
  END IF;
  IF NOT customer_token_valid(p_establishment_id, v_digits, p_token) THEN
    RAISE EXCEPTION 'Confirme seu telefone para ver seus pedidos neste aparelho.';
  END IF;
  RETURN QUERY
  SELECT o.id, o.status, o.items, o.total, o.order_type, o.source, o.created_at
  FROM orders o
  WHERE o.establishment_id = p_establishment_id AND phone_digits(o.customer_phone) = v_digits
  ORDER BY o.created_at DESC
  LIMIT 20;
END;
$$;

-- Prévia do resgate no carrinho, também exige o aparelho verificado.
CREATE OR REPLACE FUNCTION check_loyalty_redemption(p_establishment_id UUID, p_reward_id UUID, p_customer_phone TEXT, p_token TEXT)
RETURNS TABLE(valid BOOLEAN, benefit_type TEXT, benefit_value NUMERIC, points_cost INT, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT customer_token_valid(p_establishment_id, phone_digits(p_customer_phone), p_token) THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::NUMERIC, NULL::INT, 'Confirme seu telefone para usar seus pontos neste aparelho.'::TEXT;
    RETURN;
  END IF;
  RETURN QUERY SELECT * FROM validate_loyalty_redemption(p_establishment_id, p_reward_id, p_customer_phone);
END;
$$;

-- Cliente sem telefone (mesa, balcão) não vira um "cliente" vazio.
CREATE OR REPLACE FUNCTION apply_loyalty_points_on_order_change()
RETURNS TRIGGER AS $$
DECLARE
  v_settings loyalty_settings%ROWTYPE;
  v_customer_id UUID;
  v_points_earned INT;
  v_earned_tx loyalty_transactions%ROWTYPE;
  v_redeem_tx loyalty_transactions%ROWTYPE;
  v_digits TEXT := regexp_replace(COALESCE(NEW.customer_phone, ''), '\D', '', 'g');
BEGIN
  IF length(v_digits) < 10 THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_customer_id FROM customers
  WHERE establishment_id = NEW.establishment_id AND phone = v_digits;

  IF v_customer_id IS NULL THEN
    INSERT INTO customers (establishment_id, phone, name)
    VALUES (NEW.establishment_id, v_digits, NEW.customer_name)
    ON CONFLICT (establishment_id, phone) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_customer_id;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.loyalty_reward_id IS NOT NULL AND NEW.loyalty_points_redeemed > 0 THEN
    UPDATE customers SET loyalty_points_balance = loyalty_points_balance - NEW.loyalty_points_redeemed, updated_at = now()
    WHERE id = v_customer_id;
    INSERT INTO loyalty_transactions (establishment_id, customer_id, order_id, reward_id, type, points, description)
    VALUES (NEW.establishment_id, v_customer_id, NEW.id, NEW.loyalty_reward_id, 'redeem', -NEW.loyalty_points_redeemed, 'Resgate de recompensa no pedido');
  END IF;

  IF (TG_OP = 'INSERT' AND NEW.status = 'completed')
     OR (TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed') THEN
    UPDATE customers SET last_order_at = NEW.created_at, updated_at = now()
    WHERE id = v_customer_id AND (last_order_at IS NULL OR last_order_at < NEW.created_at);

    SELECT * INTO v_settings FROM loyalty_settings WHERE establishment_id = NEW.establishment_id;
    IF FOUND AND v_settings.is_active
       AND (v_settings.min_order_value_for_points IS NULL OR NEW.total >= v_settings.min_order_value_for_points) THEN
      v_points_earned := floor(NEW.total * v_settings.points_per_currency);
      IF v_points_earned > 0 AND NOT EXISTS (SELECT 1 FROM loyalty_transactions WHERE order_id = NEW.id AND type = 'earn') THEN
        UPDATE customers SET loyalty_points_balance = loyalty_points_balance + v_points_earned, updated_at = now()
        WHERE id = v_customer_id;
        INSERT INTO loyalty_transactions (establishment_id, customer_id, order_id, type, points, description)
        VALUES (NEW.establishment_id, v_customer_id, NEW.id, 'earn', v_points_earned, 'Pontos ganhos no pedido');
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' AND NEW.status = 'cancelled' THEN
    SELECT * INTO v_earned_tx FROM loyalty_transactions WHERE order_id = NEW.id AND type = 'earn' LIMIT 1;
    IF FOUND THEN
      UPDATE customers SET loyalty_points_balance = loyalty_points_balance - v_earned_tx.points, updated_at = now()
      WHERE id = v_customer_id;
      INSERT INTO loyalty_transactions (establishment_id, customer_id, order_id, type, points, description)
      VALUES (NEW.establishment_id, v_customer_id, NEW.id, 'revoke_earn', -v_earned_tx.points, 'Estorno: pedido cancelado após concluído');
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled'
     AND NEW.loyalty_reward_id IS NOT NULL THEN
    SELECT * INTO v_redeem_tx FROM loyalty_transactions WHERE order_id = NEW.id AND type = 'redeem' LIMIT 1;
    IF FOUND THEN
      UPDATE customers SET loyalty_points_balance = loyalty_points_balance + (-v_redeem_tx.points), updated_at = now()
      WHERE id = v_customer_id;
      INSERT INTO loyalty_transactions (establishment_id, customer_id, order_id, reward_id, type, points, description)
      VALUES (NEW.establishment_id, v_customer_id, NEW.id, NEW.loyalty_reward_id, 'revoke_redeem', -v_redeem_tx.points, 'Estorno: pedido com resgate foi cancelado');
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------
-- PAINEL: aceite, avanço, cancelamento e balcão numa transação só
-- ------------------------------------------------------------

-- Baixa (p_direction = 1) ou estorno (-1) de estoque dos itens. Item de
-- combo mexe no estoque de cada produto escolhido.
CREATE OR REPLACE FUNCTION adjust_stock_for_items(p_establishment_id UUID, p_items JSONB, p_direction INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_sel JSONB;
  v_qty INT;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    v_qty := COALESCE((v_item->>'quantity')::int, 0);
    IF jsonb_typeof(v_item->'combo_selections') = 'array' AND jsonb_array_length(v_item->'combo_selections') > 0 THEN
      FOR v_sel IN SELECT * FROM jsonb_array_elements(v_item->'combo_selections') LOOP
        UPDATE products SET stock_qty = GREATEST(stock_qty - p_direction * v_qty, 0)
        WHERE id = (v_sel->>'product_id')::uuid AND establishment_id = p_establishment_id AND track_stock;
      END LOOP;
    ELSIF v_item->>'product_id' IS NOT NULL THEN
      UPDATE products SET stock_qty = GREATEST(stock_qty - p_direction * v_qty, 0)
      WHERE id = (v_item->>'product_id')::uuid AND establishment_id = p_establishment_id AND track_stock;
    END IF;
  END LOOP;
END;
$$;

-- Efeitos do primeiro aceite: financeiro (exceto mesa, que lança no
-- fechamento da comanda), comissão do Pix automático e baixa de estoque.
CREATE OR REPLACE FUNCTION apply_first_acceptance(p_order orders)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_order.source IS DISTINCT FROM 'mesa' AND NOT EXISTS (
    SELECT 1 FROM financial_entries WHERE order_id = p_order.id AND type = 'income'
  ) THEN
    INSERT INTO financial_entries (establishment_id, order_id, type, amount, description)
    VALUES (p_order.establishment_id, p_order.id, 'income', p_order.total,
            'Pedido #' || substr(p_order.id::text, 1, 8) || ' - ' || p_order.customer_name);
  END IF;

  IF p_order.payment_method = 'mercadopago_pix' AND p_order.payment_status = 'approved' AND NOT EXISTS (
    SELECT 1 FROM financial_entries WHERE order_id = p_order.id AND type = 'expense'
  ) THEN
    INSERT INTO financial_entries (establishment_id, order_id, type, amount, description)
    VALUES (p_order.establishment_id, p_order.id, 'expense', 1.00, 'Comissão da plataforma (Pix automático)');
  END IF;

  PERFORM adjust_stock_for_items(p_order.establishment_id, p_order.items, 1);
END;
$$;

CREATE OR REPLACE FUNCTION assert_order_owner(p_order_id UUID)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM establishments WHERE id = o.establishment_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;
  RETURN o;
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

  v_fee := COALESCE(p_shipping_fee, o.shipping_fee, 0);
  IF v_fee < 0 THEN
    RAISE EXCEPTION 'Taxa de entrega inválida.';
  END IF;

  UPDATE orders SET
    status = p_new_status,
    shipping_fee = round(v_fee, 2),
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

-- confirmado -> em preparo -> concluído; p_dispatch marca "saiu para
-- entrega / pronto para retirar" sem mudar o status.
CREATE OR REPLACE FUNCTION advance_order(p_order_id UUID, p_new_status TEXT DEFAULT NULL, p_dispatch BOOLEAN DEFAULT false)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o orders%ROWTYPE;
BEGIN
  o := assert_order_owner(p_order_id);
  IF o.status NOT IN ('confirmed', 'preparing') THEN
    RAISE EXCEPTION 'Este pedido não pode avançar a partir de "%".', o.status;
  END IF;
  IF p_new_status IS NOT NULL AND p_new_status NOT IN ('preparing', 'completed') THEN
    RAISE EXCEPTION 'Status inválido.';
  END IF;
  IF p_new_status = 'preparing' AND o.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Só pedidos confirmados vão para o preparo.';
  END IF;

  UPDATE orders SET
    status = COALESCE(p_new_status, status),
    dispatched_at = CASE WHEN p_dispatch AND dispatched_at IS NULL THEN now() ELSE dispatched_at END
  WHERE id = o.id
  RETURNING * INTO o;
  RETURN o;
END;
$$;

CREATE OR REPLACE FUNCTION cancel_order(p_order_id UUID, p_reason TEXT)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o orders%ROWTYPE;
  v_was_accepted BOOLEAN;
BEGIN
  o := assert_order_owner(p_order_id);
  IF o.status = 'cancelled' THEN
    RAISE EXCEPTION 'Este pedido já está cancelado.';
  END IF;
  IF COALESCE(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Informe o motivo do cancelamento.';
  END IF;
  v_was_accepted := o.status IN ('confirmed', 'preparing', 'completed');

  UPDATE orders SET status = 'cancelled', cancellation_reason = left(trim(p_reason), 300)
  WHERE id = o.id
  RETURNING * INTO o;

  IF v_was_accepted THEN
    PERFORM adjust_stock_for_items(o.establishment_id, o.items, -1);
    DELETE FROM financial_entries WHERE order_id = o.id;
  END IF;
  RETURN o;
END;
$$;

-- Webhook do Mercado Pago e automação por tempo (service role).
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
  UPDATE orders SET status = p_new_status WHERE id = o.id RETURNING * INTO o;
  PERFORM apply_first_acceptance(o);
  RETURN o;
END;
$$;

-- Venda de balcão: o dono informa itens e preços (é ele quem vende),
-- mas estoque, pedido e financeiro vão juntos.
CREATE OR REPLACE FUNCTION balcao_sale(p_payload JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_est_id UUID := (p_payload->>'establishment_id')::uuid;
  v_items JSONB := COALESCE(p_payload->'items', '[]'::jsonb);
  v_item JSONB;
  v_sel JSONB;
  v_qty INT;
  v_stock RECORD;
  v_subtotal NUMERIC;
  v_discount NUMERIC := GREATEST(COALESCE(NULLIF(p_payload->>'discount', '')::numeric, 0), 0);
  v_total NUMERIC;
  v_id UUID := gen_random_uuid();
  o orders%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM establishments WHERE id = v_est_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Loja não encontrada.';
  END IF;
  IF jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Adicione itens à venda.';
  END IF;

  -- Confere estoque com trava de linha antes de vender.
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::int, 0);
    IF v_qty < 1 THEN
      RAISE EXCEPTION 'Quantidade inválida.';
    END IF;
    FOR v_sel IN
      SELECT * FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(v_item->'combo_selections') = 'array' AND jsonb_array_length(v_item->'combo_selections') > 0
             THEN v_item->'combo_selections' ELSE jsonb_build_array(v_item) END)
    LOOP
      SELECT name, stock_qty, track_stock INTO v_stock FROM products
      WHERE id = (v_sel->>'product_id')::uuid AND establishment_id = v_est_id FOR UPDATE;
      IF FOUND AND v_stock.track_stock AND v_stock.stock_qty < v_qty THEN
        RAISE EXCEPTION 'Estoque insuficiente de % (disponível: %).', v_stock.name, v_stock.stock_qty;
      END IF;
    END LOOP;
  END LOOP;

  SELECT round(COALESCE(SUM((i->>'total_price')::numeric), 0), 2) INTO v_subtotal FROM jsonb_array_elements(v_items) i;
  v_discount := LEAST(round(v_discount, 2), v_subtotal);
  v_total := v_subtotal - v_discount;

  INSERT INTO orders (id, establishment_id, customer_name, customer_phone, items, subtotal, shipping_fee, discount, total,
                      status, source, order_type, payment_method, change_for, discount_source, notes)
  VALUES (v_id, v_est_id,
          COALESCE(NULLIF(left(trim(COALESCE(p_payload->>'customer_name', '')), 80), ''), 'Consumidor final'),
          left(trim(COALESCE(p_payload->>'customer_phone', '')), 30),
          v_items, v_subtotal, 0, v_discount, v_total, 'completed', 'balcao', 'pickup',
          NULLIF(p_payload->>'payment_method', ''), NULLIF(p_payload->>'change_for', '')::numeric,
          CASE WHEN v_discount > 0 THEN 'manual' END,
          NULLIF(left(trim(COALESCE(p_payload->>'notes', '')), 300), ''))
  RETURNING * INTO o;

  PERFORM apply_first_acceptance(o);
  RETURN v_id;
END;
$$;

-- ------------------------------------------------------------
-- POLÍTICAS
-- ------------------------------------------------------------
-- (Fechamento da inserção direta de pedidos e da exclusão de lançamentos
-- de pedido: migration 046, depois do deploy.)

-- error_logs: limite por IP e tamanho máximo (evita encher o banco).
CREATE OR REPLACE FUNCTION limit_error_logs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT check_rate_limit('error_logs', request_ip(), 20, INTERVAL '10 minutes') THEN
    RETURN NULL; -- descarta em silêncio
  END IF;
  NEW.message := left(COALESCE(NEW.message, ''), 1000);
  NEW.scope := left(COALESCE(NEW.scope, ''), 120);
  IF NEW.detail IS NOT NULL AND length(NEW.detail::text) > 8000 THEN
    NEW.detail := jsonb_build_object('truncated', left(NEW.detail::text, 8000));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_limit_error_logs ON error_logs;
CREATE TRIGGER trg_limit_error_logs BEFORE INSERT ON error_logs FOR EACH ROW EXECUTE FUNCTION limit_error_logs();

-- ------------------------------------------------------------
-- PERMISSÕES
-- O Supabase concede EXECUTE a anon/authenticated por padrão em toda
-- função nova; as internas precisam ser fechadas explicitamente.
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION issue_customer_token(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION customer_token_valid(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION create_customer_otp(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION price_order_items(UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION adjust_stock_for_items(UUID, JSONB, INT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION apply_first_acceptance(orders) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION assert_order_owner(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION service_accept_order(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION establishment_is_blocked(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION check_rate_limit(TEXT, TEXT, INT, INTERVAL) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION decrement_product_stock(UUID, INT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION increment_product_stock(UUID, INT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION save_cart_draft(UUID, TEXT, TEXT, JSONB, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_customer_otp(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION service_accept_order(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION validate_loyalty_redemption(UUID, UUID, TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION place_order(JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION quote_order_items(UUID, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION establishment_is_open_now(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION verify_customer_otp(UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_customer_profile(UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION upsert_customer_profile(UUID, TEXT, TEXT, DATE, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_customer_address(UUID, TEXT, UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_customer_data(UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_orders_by_phone(UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION check_loyalty_redemption(UUID, UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION revoke_customer_tokens(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION accept_order(UUID, TEXT, NUMERIC, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION advance_order(UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_order(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION balcao_sale(JSONB) TO authenticated;
REVOKE EXECUTE ON FUNCTION accept_order(UUID, TEXT, NUMERIC, TEXT, INT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION advance_order(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION cancel_order(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION balcao_sale(JSONB) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION revoke_customer_tokens(UUID) FROM PUBLIC, anon;
