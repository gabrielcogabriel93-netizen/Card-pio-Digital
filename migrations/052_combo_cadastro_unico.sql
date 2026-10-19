-- ============================================================
-- Migration 052 -- combos: cadastro de uma vez e sabores livres
-- (rodar DEPOIS da 050; pode rodar antes ou depois do deploy).
--
-- 1. O limite de sabores da pizza do combo passa a valer por si (1 a 4),
--    sem ficar preso ao limite do tamanho na pizza avulsa.
-- 2. save_combo: o painel salva o combo inteiro (dados, partes, regras da
--    pizza e produtos) numa transação só. Ou salva tudo, ou nada.
-- ============================================================

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

CREATE OR REPLACE FUNCTION save_combo(p_payload JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_est UUID;
  v_combo_id UUID := NULLIF(p_payload->>'id', '')::uuid;
  v_name TEXT := left(trim(COALESCE(p_payload->>'name', '')), 120);
  v_price NUMERIC := COALESCE(NULLIF(p_payload->>'price', '')::numeric, -1);
  v_active BOOLEAN := COALESCE((p_payload->>'is_active')::boolean, false);
  v_groups JSONB := COALESCE(p_payload->'groups', '[]'::jsonb);
  v_g JSONB;
  v_gid UUID;
  v_is_pizza BOOLEAN;
  v_size UUID;
  v_max INT;
  v_pids UUID[];
  v_keep UUID[] := ARRAY[]::uuid[];
  v_order INT := 0;
  v_count INT;
BEGIN
  SELECT id INTO v_est FROM establishments WHERE owner_id = auth.uid();
  IF v_est IS NULL THEN
    RAISE EXCEPTION 'Loja não encontrada.';
  END IF;
  IF v_name = '' THEN
    RAISE EXCEPTION 'Dê um nome ao combo.';
  END IF;
  IF v_price < 0 THEN
    RAISE EXCEPTION 'Informe o preço do combo.';
  END IF;
  IF jsonb_typeof(v_groups) <> 'array' OR jsonb_array_length(v_groups) > 12 THEN
    RAISE EXCEPTION 'Partes do combo inválidas.';
  END IF;
  IF v_active AND jsonb_array_length(v_groups) = 0 THEN
    RAISE EXCEPTION 'Adicione pelo menos uma parte ao combo antes de deixá-lo disponível.';
  END IF;

  IF v_combo_id IS NULL THEN
    INSERT INTO combos (establishment_id, name, description, image_url, price, is_active, display_order)
    VALUES (v_est, v_name, NULLIF(trim(COALESCE(p_payload->>'description', '')), ''), NULLIF(p_payload->>'image_url', ''),
            round(v_price, 2), v_active,
            COALESCE((SELECT MAX(display_order) + 1 FROM combos WHERE establishment_id = v_est), 0))
    RETURNING id INTO v_combo_id;
  ELSE
    UPDATE combos SET name = v_name,
      description = NULLIF(trim(COALESCE(p_payload->>'description', '')), ''),
      image_url = NULLIF(p_payload->>'image_url', ''),
      price = round(v_price, 2), is_active = v_active
    WHERE id = v_combo_id AND establishment_id = v_est;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Combo não encontrado.';
    END IF;
  END IF;

  FOR v_g IN SELECT * FROM jsonb_array_elements(v_groups) LOOP
    v_is_pizza := COALESCE((v_g->>'is_pizza_slot')::boolean, false);
    v_size := CASE WHEN v_is_pizza THEN NULLIF(v_g->>'fixed_pizza_size_id', '')::uuid END;
    v_max := CASE WHEN v_is_pizza THEN NULLIF(v_g->>'pizza_max_flavors', '')::int END;
    IF left(trim(COALESCE(v_g->>'name', '')), 120) = '' THEN
      RAISE EXCEPTION 'Dê um nome a cada parte do combo.';
    END IF;
    IF v_is_pizza AND (v_size IS NULL OR NOT EXISTS (SELECT 1 FROM pizza_sizes WHERE id = v_size AND establishment_id = v_est)) THEN
      RAISE EXCEPTION 'Escolha o tamanho da pizza em "%".', v_g->>'name';
    END IF;
    IF v_max IS NOT NULL AND (v_max < 1 OR v_max > 4) THEN
      RAISE EXCEPTION 'Sabores por pizza vai de 1 a 4.';
    END IF;

    SELECT COALESCE(array_agg(DISTINCT x::uuid), ARRAY[]::uuid[]) INTO v_pids
    FROM jsonb_array_elements_text(COALESCE(v_g->'product_ids', '[]'::jsonb)) x;
    SELECT COUNT(*) INTO v_count FROM products
    WHERE id = ANY(v_pids) AND establishment_id = v_est AND (NOT v_is_pizza OR pizza_flavor_id IS NOT NULL);
    IF v_count <> cardinality(v_pids) THEN
      RAISE EXCEPTION 'Há um produto inválido em "%".', v_g->>'name';
    END IF;
    IF v_active AND cardinality(v_pids) = 0 THEN
      RAISE EXCEPTION 'Marque pelo menos uma opção em "%" antes de deixar o combo disponível.', v_g->>'name';
    END IF;

    v_gid := NULLIF(v_g->>'id', '')::uuid;
    IF v_gid IS NOT NULL AND EXISTS (SELECT 1 FROM combo_groups WHERE id = v_gid AND combo_id = v_combo_id) THEN
      UPDATE combo_groups SET name = left(trim(v_g->>'name'), 120), display_order = v_order,
        is_pizza_slot = v_is_pizza, fixed_pizza_size_id = v_size,
        pizza_max_flavors = v_max, pizza_allow_additionals = v_is_pizza AND COALESCE((v_g->>'pizza_allow_additionals')::boolean, false)
      WHERE id = v_gid;
    ELSE
      INSERT INTO combo_groups (combo_id, name, display_order, is_pizza_slot, fixed_pizza_size_id, pizza_max_flavors, pizza_allow_additionals)
      VALUES (v_combo_id, left(trim(v_g->>'name'), 120), v_order, v_is_pizza, v_size, v_max,
              v_is_pizza AND COALESCE((v_g->>'pizza_allow_additionals')::boolean, false))
      RETURNING id INTO v_gid;
    END IF;
    v_keep := v_keep || v_gid;

    DELETE FROM combo_group_products WHERE combo_group_id = v_gid AND NOT (product_id = ANY(v_pids));
    INSERT INTO combo_group_products (combo_group_id, product_id, display_order)
    SELECT v_gid, p, ord::int FROM unnest(v_pids) WITH ORDINALITY u(p, ord)
    ON CONFLICT (combo_group_id, product_id) DO NOTHING;
    v_order := v_order + 1;
  END LOOP;

  DELETE FROM combo_groups WHERE combo_id = v_combo_id AND NOT (id = ANY(v_keep));
  RETURN v_combo_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION save_combo(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION save_combo(JSONB) TO authenticated;
REVOKE EXECUTE ON FUNCTION price_order_items(UUID, JSONB) FROM PUBLIC, anon, authenticated;
