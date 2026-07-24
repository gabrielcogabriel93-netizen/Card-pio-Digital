-- ============================================================
-- CARDÁPIO SaaS - Migration 016
-- Perfil do cliente: a partir do primeiro pedido, nome e telefone ficam
-- salvos (vinculados ao telefone, não ao navegador) e todo endereço de
-- entrega cadastrado fica guardado com um rótulo (Casa, Trabalho...).
-- Nas próximas compras — mesmo de outro aparelho — o cliente só precisa
-- confirmar o endereço já salvo ou cadastrar um novo.
--
-- Sem conta/senha: continua sendo tudo identificado só pelo telefone,
-- mesmo modelo de confiança já usado em "Meus Pedidos"
-- (012_historico_pedidos_cliente.sql) — baixa fricção de propósito.
-- Por isso NÃO existe policy de SELECT/INSERT pública direto nas
-- tabelas: todo acesso do cliente passa por função SECURITY DEFINER que
-- exige o telefone exato. O lojista (dono da loja) pode ler direto via
-- RLS normal, útil pra uso futuro tipo CRM.
-- ============================================================

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE NOT NULL,
  phone TEXT NOT NULL, -- só dígitos, normalizado
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(establishment_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_customers_establishment_phone ON customers(establishment_id, phone);

CREATE TABLE IF NOT EXISTS customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  label TEXT NOT NULL DEFAULT 'Principal', -- "Casa", "Trabalho", livre
  street TEXT NOT NULL,
  number TEXT NOT NULL,
  neighborhood TEXT NOT NULL,
  complement TEXT,
  reference TEXT,
  zip_code TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer_id ON customer_addresses(customer_id);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_select_owner" ON customers;
CREATE POLICY "customers_select_owner" ON customers
  FOR SELECT USING (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "customer_addresses_select_owner" ON customer_addresses;
CREATE POLICY "customer_addresses_select_owner" ON customer_addresses
  FOR SELECT USING (
    customer_id IN (
      SELECT c.id FROM customers c
      JOIN establishments e ON e.id = c.establishment_id
      WHERE e.owner_id = auth.uid()
    )
  );

-- ============================================================
-- get_customer_profile: devolve nome + lista de endereços de um
-- telefone numa loja. Vazio se não encontrar (não é erro).
-- ============================================================
CREATE OR REPLACE FUNCTION get_customer_profile(p_establishment_id UUID, p_phone TEXT)
RETURNS TABLE(customer_id UUID, name TEXT, addresses JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id UUID;
  v_name TEXT;
BEGIN
  SELECT id, c.name INTO v_customer_id, v_name
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

-- ============================================================
-- upsert_customer_profile: cria ou atualiza nome/telefone. Chamado
-- depois que um pedido é enviado com sucesso.
-- ============================================================
CREATE OR REPLACE FUNCTION upsert_customer_profile(p_establishment_id UUID, p_phone TEXT, p_name TEXT)
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

  INSERT INTO customers (establishment_id, phone, name)
  VALUES (p_establishment_id, v_digits, trim(p_name))
  ON CONFLICT (establishment_id, phone)
  DO UPDATE SET name = EXCLUDED.name, updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_customer_profile(UUID, TEXT, TEXT) TO anon, authenticated;

-- ============================================================
-- upsert_customer_address: cadastra um endereço novo (p_address_id
-- nulo) ou atualiza um existente do MESMO cliente (nunca deixa
-- atualizar endereço de outro telefone). Cria o cliente na hora se
-- ainda não existir — cobre o caso de salvar tudo numa única chamada.
-- ============================================================
CREATE OR REPLACE FUNCTION upsert_customer_address(
  p_establishment_id UUID,
  p_phone TEXT,
  p_label TEXT,
  p_street TEXT,
  p_number TEXT,
  p_neighborhood TEXT,
  p_complement TEXT,
  p_reference TEXT,
  p_zip_code TEXT,
  p_address_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id UUID;
  v_result_id UUID;
  v_digits TEXT := regexp_replace(p_phone, '\D', '', 'g');
BEGIN
  SELECT id INTO v_customer_id FROM customers
  WHERE establishment_id = p_establishment_id AND phone = v_digits;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado. Salve o perfil (upsert_customer_profile) antes do endereço.';
  END IF;

  IF p_address_id IS NOT NULL THEN
    UPDATE customer_addresses
    SET label = COALESCE(NULLIF(trim(p_label), ''), 'Principal'),
        street = p_street,
        number = p_number,
        neighborhood = p_neighborhood,
        complement = p_complement,
        reference = p_reference,
        zip_code = p_zip_code,
        updated_at = now()
    WHERE id = p_address_id AND customer_id = v_customer_id
    RETURNING id INTO v_result_id;

    IF v_result_id IS NOT NULL THEN
      RETURN v_result_id;
    END IF;
    -- p_address_id não pertence a esse cliente (ou não existe mais) —
    -- cai pro insert abaixo em vez de falhar silenciosamente.
  END IF;

  INSERT INTO customer_addresses (customer_id, label, street, number, neighborhood, complement, reference, zip_code)
  VALUES (v_customer_id, COALESCE(NULLIF(trim(p_label), ''), 'Principal'), p_street, p_number, p_neighborhood, p_complement, p_reference, p_zip_code)
  RETURNING id INTO v_result_id;

  RETURN v_result_id;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_customer_address(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO anon, authenticated;

-- ============================================================
-- delete_customer_address: remove um endereço salvo (o cliente decide
-- limpar a lista). Só apaga se o telefone bater com o dono do endereço.
-- ============================================================
CREATE OR REPLACE FUNCTION delete_customer_address(p_establishment_id UUID, p_phone TEXT, p_address_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits TEXT := regexp_replace(p_phone, '\D', '', 'g');
BEGIN
  DELETE FROM customer_addresses a
  USING customers c
  WHERE a.id = p_address_id
    AND a.customer_id = c.id
    AND c.establishment_id = p_establishment_id
    AND c.phone = v_digits;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_customer_address(UUID, TEXT, UUID) TO anon, authenticated;
