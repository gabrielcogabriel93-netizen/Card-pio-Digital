-- ============================================================
-- Migration 050 -- regras da pizza dentro do combo
-- (rodar DEPOIS da 045; pode rodar antes ou depois do deploy: o app
-- antigo continua funcionando, só não oferece as opções novas).
--
-- Antes, a pizza do combo tinha tamanho fixo e o cliente escolhia UM
-- sabor. Agora cada pizza do combo tem regras do lojista:
--   pizza_max_flavors: quantos sabores (NULL = o que o tamanho permitir;
--                      1 = sabor único, ex.: promoção de um sabor só).
--   pizza_allow_additionals: aceita adicionais (borda etc.), cobrados à
--                      parte pelo preço do tamanho, como na pizza avulsa.
-- Os sabores possíveis continuam sendo os produtos marcados naquela
-- pizza do combo. O preço do combo segue fixo; só os adicionais somam.
-- ============================================================

ALTER TABLE combo_groups ADD COLUMN IF NOT EXISTS pizza_max_flavors INT;
ALTER TABLE combo_groups ADD COLUMN IF NOT EXISTS pizza_allow_additionals BOOLEAN NOT NULL DEFAULT false;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'combo_groups_pizza_max_flavors_range') THEN
    ALTER TABLE combo_groups ADD CONSTRAINT combo_groups_pizza_max_flavors_range
      CHECK (pizza_max_flavors IS NULL OR pizza_max_flavors BETWEEN 1 AND 4);
  END IF;
END $$;

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
          v_limit := LEAST(COALESCE(v_group.pizza_max_flavors, v_size.max_flavors, 1), COALESCE(v_size.max_flavors, 1));
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

REVOKE EXECUTE ON FUNCTION price_order_items(UUID, JSONB) FROM PUBLIC, anon, authenticated;
