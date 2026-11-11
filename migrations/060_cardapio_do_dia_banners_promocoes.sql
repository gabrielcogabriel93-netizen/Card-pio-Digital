-- ============================================================
-- Freguês - Migration 060: cardápio do dia, banners e promoções
--
-- 1. variation_options.sold_out_until: "acabou hoje" (feijão, uma carne)
--    marcado no Cardápio do dia, em todos os pratos de uma vez; volta
--    sozinho à meia-noite, igual ao produto.
-- 2. variation_groups.min_select: "escolha pelo menos N" (ex.: 3
--    acompanhamentos), junto com o "até N" que já existia.
-- 3. products.promo_price / promo_until / cost_price: oferta com preço
--    "de/por" e custo do prato (para a margem nas Sugestões de promoções).
-- 4. coupons.show_on_menu: cupom divulgado no banner do cardápio.
-- 5. store_banners + get_store_banners(): banners acima da busca
--    (do lojista, mais pedidos e cupons).
-- 6. store_promotions: promoções aplicadas pelas Sugestões de promoções.
-- 7. price_order_items: recusa opção esgotada, confere o mínimo e usa o
--    preço promocional valendo. public_products mostra o "por" e o "de".
-- ============================================================

ALTER TABLE variation_options ADD COLUMN IF NOT EXISTS sold_out_until TIMESTAMPTZ;
ALTER TABLE variation_groups ADD COLUMN IF NOT EXISTS min_select INT CHECK (min_select IS NULL OR min_select >= 1);

ALTER TABLE products ADD COLUMN IF NOT EXISTS promo_price NUMERIC(10,2) CHECK (promo_price IS NULL OR promo_price >= 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS promo_until TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2) CHECK (cost_price IS NULL OR cost_price >= 0);
-- Dias da semana em que o prato sai (0 = domingo ... 6 = sábado; NULL = todos).
ALTER TABLE products ADD COLUMN IF NOT EXISTS available_weekdays SMALLINT[];

ALTER TABLE coupons ADD COLUMN IF NOT EXISTS show_on_menu BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE establishments ADD COLUMN IF NOT EXISTS banner_show_top BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS banner_show_coupons BOOLEAN NOT NULL DEFAULT true;

-- Preço que vale agora: o promocional, se menor e dentro do prazo.
CREATE OR REPLACE FUNCTION product_price_now(p products)
RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p.promo_price IS NOT NULL AND p.promo_price < p.price AND (p.promo_until IS NULL OR p.promo_until > now())
      THEN p.promo_price
    ELSE p.price
  END
$$;

-- Prato servido hoje, no fuso da loja.
CREATE OR REPLACE FUNCTION product_available_today(p products)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.available_weekdays IS NULL OR cardinality(p.available_weekdays) = 0
    OR extract(dow FROM now() AT TIME ZONE COALESCE(
         (SELECT NULLIF(e.timezone, '') FROM establishments e WHERE e.id = p.establishment_id), 'America/Sao_Paulo'))::int = ANY(p.available_weekdays)
$$;

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
  -- Preço "de" quando há promoção valendo (o "por" é o price acima).
  CASE WHEN product_price_now(products) < price THEN price END::numeric(10,2) AS original_price,
  CASE WHEN product_price_now(products) < price THEN promo_until END AS promo_until,
  available_weekdays
FROM products
WHERE is_active = true;

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

-- Banners -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS store_banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  title TEXT,
  subtitle TEXT,
  image_url TEXT,
  link_type TEXT NOT NULL DEFAULT 'nenhum' CHECK (link_type IN ('nenhum', 'produto', 'combo', 'categoria', 'cupom')),
  link_ref TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  display_order INT NOT NULL DEFAULT 0,
  promotion_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (image_url IS NOT NULL OR title IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_store_banners_est ON store_banners (establishment_id, display_order);
ALTER TABLE store_banners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "store_banners_owner" ON store_banners;
CREATE POLICY "store_banners_owner" ON store_banners
  FOR ALL USING (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()))
  WITH CHECK (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));

-- Promoções aplicadas ----------------------------------------------------
CREATE TABLE IF NOT EXISTS store_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('cupom', 'combo', 'preco', 'frete')),
  title TEXT NOT NULL,
  explanation TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  coupon_id UUID REFERENCES coupons(id) ON DELETE SET NULL,
  combo_id UUID REFERENCES combos(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  banner_id UUID REFERENCES store_banners(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'encerrada')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_store_promotions_est ON store_promotions (establishment_id, created_at DESC);
ALTER TABLE store_promotions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "store_promotions_owner" ON store_promotions;
CREATE POLICY "store_promotions_owner" ON store_promotions
  FOR ALL USING (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()))
  WITH CHECK (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));

-- O que vai no carrossel acima da busca (cliente anônimo).
CREATE OR REPLACE FUNCTION get_store_banners(p_establishment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e establishments%ROWTYPE;
  v_banners JSONB;
  v_top JSONB := '[]'::jsonb;
  v_coupons JSONB := '[]'::jsonb;
BEGIN
  SELECT * INTO e FROM establishments WHERE id = p_establishment_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', b.id, 'title', b.title, 'subtitle', b.subtitle, 'image_url', b.image_url,
           'link_type', b.link_type, 'link_ref', b.link_ref) ORDER BY b.display_order, b.created_at), '[]'::jsonb)
  INTO v_banners
  FROM store_banners b
  WHERE b.establishment_id = e.id AND b.is_active
    AND (b.starts_at IS NULL OR b.starts_at <= now())
    AND (b.ends_at IS NULL OR b.ends_at > now());

  -- Mais pedidos dos últimos 30 dias (só produtos ativos e com estoque).
  IF e.banner_show_top THEN
    SELECT COALESCE(jsonb_agg(t.product_id ORDER BY t.qty DESC), '[]'::jsonb) INTO v_top
    FROM (
      SELECT (i->>'product_id')::uuid AS product_id, SUM((i->>'quantity')::int) AS qty
      FROM orders o, jsonb_array_elements(o.items) i
      WHERE o.establishment_id = e.id
        AND o.created_at > now() - INTERVAL '30 days'
        AND o.status IN ('confirmed', 'preparing', 'completed')
        AND i->>'combo_id' IS NULL
        AND (i->>'product_id') ~ '^[0-9a-f-]{36}$'
      GROUP BY 1
      HAVING SUM((i->>'quantity')::int) >= 2
      ORDER BY 2 DESC
      LIMIT 3
    ) t
    JOIN public_products pp ON pp.id = t.product_id AND pp.in_stock;
  END IF;

  IF e.banner_show_coupons THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'code', c.code, 'discount_type', c.discount_type, 'discount_value', c.discount_value, 'expires_at', c.expires_at)
             ORDER BY c.created_at DESC), '[]'::jsonb)
    INTO v_coupons
    FROM coupons c
    WHERE c.establishment_id = e.id AND c.is_active AND c.show_on_menu
      AND (c.expires_at IS NULL OR c.expires_at > now())
      AND (c.max_uses IS NULL OR COALESCE(c.used_count, 0) < c.max_uses);
  END IF;

  RETURN jsonb_build_object('banners', v_banners, 'top_products', v_top, 'coupons', v_coupons);
END;
$$;

REVOKE EXECUTE ON FUNCTION get_store_banners(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_store_banners(UUID) TO anon, authenticated;
