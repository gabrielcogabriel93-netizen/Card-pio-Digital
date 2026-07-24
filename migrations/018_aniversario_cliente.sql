-- ============================================================
-- CARDÁPIO SaaS - Migration 018
-- Data de nascimento no perfil do cliente + desconto automático de
-- aniversário (opcional, configurado pelo lojista). Sem WhatsApp
-- automático envolvido: o "parabéns" acontece na hora — quando o
-- cliente digita o telefone no checkout no dia do aniversário dele, o
-- cardápio já mostra a mensagem e aplica o desconto sozinho, sem
-- precisar de nenhum envio de mensagem.
-- ============================================================

ALTER TABLE customers ADD COLUMN IF NOT EXISTS birth_date DATE;

-- NULL = funcionalidade desligada (padrão). Lojista define um valor em
-- Configurações pra ativar.
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS birthday_discount_percent NUMERIC(5,2);

-- View pública precisa expor o percentual pro cardápio saber se deve
-- checar aniversário e mostrar o valor certo no banner.
CREATE OR REPLACE VIEW public_establishments AS
SELECT
  id,
  name,
  slug,
  whatsapp_number,
  logo_url,
  theme_color,
  address,
  opening_hours,
  is_open,
  delivery_fee,
  offers_delivery,
  offers_pickup,
  order_tracking_enabled,
  use_neighborhood_delivery_fee,
  birthday_discount_percent
FROM establishments;

GRANT SELECT ON public_establishments TO anon, authenticated;

-- get_customer_profile precisa devolver a data de nascimento salva —
-- muda a lista de colunas do retorno, então precisa de DROP antes
-- (Postgres não permite trocar OUT params com CREATE OR REPLACE).
DROP FUNCTION IF EXISTS get_customer_profile(UUID, TEXT);

CREATE OR REPLACE FUNCTION get_customer_profile(p_establishment_id UUID, p_phone TEXT)
RETURNS TABLE(customer_id UUID, name TEXT, birth_date DATE, addresses JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id UUID;
  v_name TEXT;
  v_birth_date DATE;
BEGIN
  SELECT id, c.name, c.birth_date INTO v_customer_id, v_name, v_birth_date
  FROM customers c
  WHERE c.establishment_id = p_establishment_id
    AND c.phone = regexp_replace(p_phone, '\D', '', 'g')
  LIMIT 1;

  IF v_customer_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    v_customer_id,
    v_name,
    v_birth_date,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', a.id,
            'label', a.label,
            'street', a.street,
            'number', a.number,
            'neighborhood', a.neighborhood,
            'complement', a.complement,
            'reference', a.reference,
            'zip_code', a.zip_code
          ) ORDER BY a.updated_at DESC
        )
        FROM customer_addresses a
        WHERE a.customer_id = v_customer_id
      ),
      '[]'::jsonb
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_customer_profile(UUID, TEXT) TO anon, authenticated;

-- upsert_customer_profile ganha o parâmetro de data de nascimento
-- (opcional — o cliente não é obrigado a informar).
DROP FUNCTION IF EXISTS upsert_customer_profile(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION upsert_customer_profile(
  p_establishment_id UUID,
  p_phone TEXT,
  p_name TEXT,
  p_birth_date DATE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_digits TEXT := regexp_replace(p_phone, '\D', '', 'g');
BEGIN
  IF v_digits = '' OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Telefone e nome são obrigatórios.';
  END IF;

  INSERT INTO customers (establishment_id, phone, name, birth_date)
  VALUES (p_establishment_id, v_digits, trim(p_name), p_birth_date)
  ON CONFLICT (establishment_id, phone)
  -- Só sobrescreve birth_date se um valor novo foi enviado — assim uma
  -- chamada futura sem esse campo não apaga o que já tinha sido salvo.
  DO UPDATE SET
    name = EXCLUDED.name,
    birth_date = COALESCE(EXCLUDED.birth_date, customers.birth_date),
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_customer_profile(UUID, TEXT, TEXT, DATE) TO anon, authenticated;
