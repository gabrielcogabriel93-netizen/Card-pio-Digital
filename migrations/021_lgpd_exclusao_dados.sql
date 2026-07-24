-- ============================================================
-- CARDÁPIO SaaS - Migration 021
-- Direito de exclusão (LGPD): o cliente pode apagar o próprio perfil
-- salvo (nome, data de nascimento, endereços) numa loja, informando o
-- telefone — mesmo modelo de confiança já usado no resto do app
-- (get_orders_by_phone, get_customer_profile).
--
-- Escopo da exclusão: só o PERFIL (tabela `customers`, com
-- `customer_addresses` indo junto via ON DELETE CASCADE). Os pedidos já
-- feitos (tabela `orders`) NÃO são apagados nem anonimizados aqui — são
-- registro comercial/fiscal da loja, com obrigação de guarda própria
-- (exceção prevista na própria LGPD pra cumprimento de obrigação legal).
-- ============================================================

CREATE OR REPLACE FUNCTION delete_customer_data(p_establishment_id UUID, p_phone TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits TEXT := regexp_replace(p_phone, '\D', '', 'g');
BEGIN
  IF v_digits = '' THEN
    RETURN;
  END IF;

  DELETE FROM customers
  WHERE establishment_id = p_establishment_id
    AND phone = v_digits;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_customer_data(UUID, TEXT) TO anon, authenticated;
