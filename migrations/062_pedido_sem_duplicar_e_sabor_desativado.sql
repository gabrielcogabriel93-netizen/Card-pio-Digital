-- ============================================================
-- Freguês - Migration 062
-- 1) Pedido sem duplicar: o cardápio manda um request_id por envio; se a
--    internet cair depois que o pedido foi gravado e o envio se repetir,
--    place_order devolve o mesmo pedido em vez de criar outro.
-- 3) Segurança: apagar aviso de pedido só pela inscrição exata (antes um
--    anônimo podia apagar os avisos de todas as lojas) e search_path fixo
--    em generate_unique_slug.
-- 2) Sabor de pizza desativado: o produto ligado a ele some do cardápio
--    (antes ficava à venda e o pedido era recusado com "Combinação de
--    sabores inválida"), e as mensagens do servidor dizem o que houve.
-- Gerada por scratchpad/gen062.cjs a partir da 055 (place_order) e da
-- 060 (price_order_items). Depende da 061 (vitrine com 3D).
-- ============================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_request_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS orders_client_request_uniq
  ON orders (establishment_id, client_request_id) WHERE client_request_id IS NOT NULL;

-- Vitrine: produto de pizza só aparece se o sabor dele estiver ativo.
CREATE OR REPLACE VIEW public_products AS
SELECT
  id,
  establishment_id,
  category_id,
  name,
  description,
  product_price_now(products)::numeric(10,2) AS price,
  image_url,
  display_order,
  (CASE WHEN track_stock THEN stock_qty > 0 ELSE true END)
    AND (sold_out_until IS NULL OR sold_out_until <= now())
    AND product_available_today(products) AS in_stock,
  is_featured,
  pizza_flavor_id,
  CASE WHEN product_price_now(products) < price THEN price END::numeric(10,2) AS original_price,
  CASE WHEN product_price_now(products) < price THEN promo_until END AS promo_until,
  available_weekdays,
  model_3d_url,
  model_3d_ios_url
FROM products
WHERE is_active = true
  AND (pizza_flavor_id IS NULL OR EXISTS (
    SELECT 1 FROM pizza_flavors f WHERE f.id = products.pizza_flavor_id AND f.is_active = true
  ));

GRANT SELECT ON public_products TO anon, authenticated;

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
  v_name TEXT;
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
  v_sel JSONB;
  v_limit INT;
  v_extra_ids UUID[];
  v_flavor_names TEXT;
  v_extra_total NUMERIC;
  v_add_price NUMERIC;
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
      v_extra_total := 0;
      FOR v_group IN SELECT * FROM combo_groups WHERE combo_id = v_combo.id ORDER BY display_order, created_at LOOP
        SELECT s INTO v_sel
        FROM jsonb_array_elements(COALESCE(v_item->'selections', '[]'::jsonb)) s
        WHERE (s->>'group_id')::uuid = v_group.id
        LIMIT 1;
        v_sel_product_id := (v_sel->>'product_id')::uuid;
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
        v_flavor_names := v_sel_product.name;

        -- Pizza do combo (migration 050): o lojista define quantos sabores
        -- valem (pizza_max_flavors, limitado ao tamanho) e se aceita
        -- adicionais (cobrados à parte, preço do tamanho fixo). Todo sabor
        -- precisa estar na lista dessa pizza do combo.
        IF v_group.is_pizza_slot THEN
          SELECT * INTO v_size FROM pizza_sizes WHERE id = v_group.fixed_pizza_size_id;
          -- Regra do combo vale por si (o lojista pode liberar 3 sabores no
          -- combo mesmo que a pizza avulsa daquele tamanho aceite 2).
          v_limit := COALESCE(v_group.pizza_max_flavors, v_size.max_flavors, 1);
          SELECT COALESCE(array_agg(DISTINCT x::uuid), ARRAY[]::uuid[]) INTO v_extra_ids
          FROM jsonb_array_elements_text(COALESCE(v_sel->'flavor_product_ids', '[]'::jsonb)) x;
          v_extra_ids := array_remove(v_extra_ids, v_sel_product_id);
          IF 1 + cardinality(v_extra_ids) > v_limit THEN
            RAISE EXCEPTION 'Em "%" vale até % sabor(es).', v_group.name, v_limit;
          END IF;
          IF cardinality(v_extra_ids) > 0 THEN
            SELECT category INTO v_own_category FROM pizza_flavors WHERE id = v_sel_product.pizza_flavor_id;
            SELECT COUNT(*) INTO v_count
            FROM products p
            JOIN combo_group_products cgp ON cgp.product_id = p.id AND cgp.combo_group_id = v_group.id
            LEFT JOIN pizza_flavors pf ON pf.id = p.pizza_flavor_id
            WHERE p.id = ANY(v_extra_ids) AND p.is_active = true
              AND (p.sold_out_until IS NULL OR p.sold_out_until <= now())
              AND (v_own_category IS NULL OR pf.category IS NULL OR pf.category = v_own_category);
            IF v_count <> cardinality(v_extra_ids) THEN
              RAISE EXCEPTION 'Combinação de sabores inválida em "%".', v_group.name;
            END IF;
            SELECT v_sel_product.name || ' + ' || string_agg(p.name, ' + ' ORDER BY p.name) INTO v_flavor_names
            FROM products p WHERE p.id = ANY(v_extra_ids);
          END IF;

          SELECT COALESCE(array_agg(DISTINCT x::uuid), ARRAY[]::uuid[]) INTO v_additional_ids
          FROM jsonb_array_elements_text(COALESCE(v_sel->'additional_ids', '[]'::jsonb)) x;
          IF cardinality(v_additional_ids) > 0 THEN
            IF NOT v_group.pizza_allow_additionals THEN
              RAISE EXCEPTION 'Este combo não aceita adicionais em "%".', v_group.name;
            END IF;
            SELECT COUNT(*) INTO v_count FROM pizza_additionals
            WHERE id = ANY(v_additional_ids) AND establishment_id = p_establishment_id AND is_active = true;
            IF v_count <> cardinality(v_additional_ids) THEN
              RAISE EXCEPTION 'Um adicional escolhido não está mais disponível.';
            END IF;
          END IF;
        ELSE
          v_additional_ids := ARRAY[]::uuid[];
        END IF;

        v_variations := v_variations || jsonb_build_object('group_name', v_group.name, 'option_name', v_flavor_names, 'price_delta', 0);
        IF cardinality(v_additional_ids) > 0 THEN
          SELECT COALESCE(SUM(COALESCE(ap.price, 0)), 0) INTO v_add_price
          FROM unnest(v_additional_ids) a(id)
          LEFT JOIN pizza_additional_prices ap ON ap.additional_id = a.id AND ap.size_id = v_group.fixed_pizza_size_id;
          v_extra_total := v_extra_total + v_add_price;
          SELECT v_variations || COALESCE(jsonb_agg(jsonb_build_object(
                   'group_name', 'Adicional (' || v_group.name || ')', 'option_name', pa.name, 'price_delta', COALESCE(ap.price, 0)) ORDER BY pa.display_order), '[]'::jsonb)
          INTO v_variations
          FROM pizza_additionals pa
          LEFT JOIN pizza_additional_prices ap ON ap.additional_id = pa.id AND ap.size_id = v_group.fixed_pizza_size_id
          WHERE pa.id = ANY(v_additional_ids);
        END IF;
        v_selections := v_selections || jsonb_build_object('group_id', v_group.id, 'group_name', v_group.name, 'product_id', v_sel_product.id, 'product_name', v_flavor_names);
        v_sel_product_id := NULL;
        v_sel := NULL;
      END LOOP;
      v_unit := v_combo.price + v_extra_total;
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
      IF NOT product_available_today(v_product) THEN
        RAISE EXCEPTION '% não é servido hoje.', v_product.name;
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
        -- Sabor desativado no painel (o produto pode ter ficado ativo).
        IF NOT EXISTS (SELECT 1 FROM pizza_flavors WHERE id = v_product.pizza_flavor_id AND establishment_id = p_establishment_id AND is_active = true) THEN
          RAISE EXCEPTION '% não está disponível no momento. Escolha outro sabor.', v_product.name;
        END IF;
        SELECT COUNT(*) INTO v_count FROM pizza_flavors
        WHERE id = ANY(v_flavor_ids) AND establishment_id = p_establishment_id AND is_active = true;
        IF v_count <> cardinality(v_flavor_ids) THEN
          RAISE EXCEPTION 'Um dos sabores escolhidos para % não está mais disponível. Escolha outro sabor.', v_product.name;
        END IF;
        SELECT category INTO v_own_category FROM pizza_flavors WHERE id = v_product.pizza_flavor_id;
        SELECT COUNT(*) INTO v_count FROM pizza_flavors
        WHERE id = ANY(v_flavor_ids) AND establishment_id = p_establishment_id AND is_active = true
          AND (v_own_category IS NULL OR category IS NULL OR category = v_own_category);
        IF v_count <> cardinality(v_flavor_ids) THEN
          RAISE EXCEPTION 'Não dá para juntar sabor doce e salgado na mesma pizza (%).', v_product.name;
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
        -- Opção marcada como "acabou hoje" no Cardápio do dia.
        SELECT vo.name INTO v_name FROM variation_options vo WHERE vo.id = ANY(v_option_ids) AND vo.sold_out_until > now() LIMIT 1;
        IF v_name IS NOT NULL THEN
          RAISE EXCEPTION '"%" acabou por hoje em %. Escolha outra opção.', v_name, v_product.name;
        END IF;

        FOR v_group IN SELECT * FROM variation_groups WHERE product_id = v_product.id ORDER BY display_order LOOP
          SELECT COUNT(*) INTO v_count FROM variation_options WHERE variation_group_id = v_group.id AND id = ANY(v_option_ids);
          IF v_group.is_required AND v_count = 0 THEN
            RAISE EXCEPTION 'Escolha uma opção em "%" para %.', v_group.name, v_product.name;
          END IF;
          IF NOT v_group.allow_multiple AND v_count > 1 THEN
            RAISE EXCEPTION 'Escolha só uma opção em "%".', v_group.name;
          END IF;
          IF v_group.min_select IS NOT NULL AND v_count > 0 AND v_count < v_group.min_select THEN
            RAISE EXCEPTION 'Escolha pelo menos % opção(ões) em "%".', v_group.min_select, v_group.name;
          END IF;
          IF v_group.is_required AND v_group.min_select IS NOT NULL AND v_count < v_group.min_select THEN
            RAISE EXCEPTION 'Escolha pelo menos % opção(ões) em "%".', v_group.min_select, v_group.name;
          END IF;
          IF v_group.max_select IS NOT NULL AND v_count > v_group.max_select THEN
            RAISE EXCEPTION 'Escolha até % opção(ões) em "%".', v_group.max_select, v_group.name;
          END IF;
        END LOOP;

        SELECT COALESCE(jsonb_agg(jsonb_build_object('group_name', vg.name, 'option_name', vo.name, 'price_delta', COALESCE(vo.price_delta, 0))
                 ORDER BY vg.display_order, vo.display_order), '[]'::jsonb),
               product_price_now(v_product) + COALESCE(SUM(COALESCE(vo.price_delta, 0)), 0)
        INTO v_variations, v_unit
        FROM variation_options vo
        JOIN variation_groups vg ON vg.id = vo.variation_group_id
        WHERE vo.id = ANY(v_option_ids);
        IF v_unit IS NULL THEN
          v_unit := product_price_now(v_product);
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
  v_request_id UUID;
  v_existing orders%ROWTYPE;
  v_mp_ok BOOLEAN;
BEGIN
  SELECT * INTO e FROM establishments WHERE id = v_est_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loja não encontrada.';
  END IF;

  -- Mesmo envio repetido (a internet caiu depois que o pedido foi gravado e o
  -- cardápio tentou de novo): devolve o pedido que já existe, sem duplicar.
  BEGIN
    v_request_id := NULLIF(p_payload->>'request_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_request_id := NULL;
  END;
  IF v_request_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM orders WHERE establishment_id = v_est_id AND client_request_id = v_request_id;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'order_id', v_existing.id,
        'subtotal', v_existing.subtotal,
        'discount', v_existing.discount,
        'shipping_fee', v_existing.shipping_fee,
        'shipping_fee_to_confirm', v_existing.shipping_fee_to_confirm,
        'total', v_existing.total,
        'items', v_existing.items,
        'customer_token', NULL,
        'repeated', true
      );
    END IF;
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
    shipping_fee_to_confirm, client_request_id
  ) VALUES (
    v_order_id, v_est_id, v_name, v_phone, v_items, v_subtotal, v_fee, v_discount, v_total,
    'pending', CASE WHEN v_order_type = 'mesa' THEN 'mesa' ELSE 'online' END, v_order_type, v_addr, v_payment, v_payment_status,
    NULLIF(left(trim(COALESCE(p_payload->>'notes', '')), 500), ''),
    v_coupon_code, v_reward_id, v_points, v_tab_id, v_change, v_discount_source, true,
    v_fee_to_confirm, v_request_id
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

-- Aviso de pedido: o cliente desliga só a própria inscrição (pedido + aparelho).
DROP POLICY IF EXISTS "order_push_subscriptions_delete_public" ON order_push_subscriptions;
CREATE OR REPLACE FUNCTION remove_order_push_subscription(p_order_id UUID, p_endpoint TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $fn$
  DELETE FROM order_push_subscriptions WHERE order_id = p_order_id AND endpoint = p_endpoint;
$fn$;
REVOKE EXECUTE ON FUNCTION remove_order_push_subscription(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION remove_order_push_subscription(UUID, TEXT) TO anon, authenticated;

ALTER FUNCTION generate_unique_slug(TEXT) SET search_path = public;
