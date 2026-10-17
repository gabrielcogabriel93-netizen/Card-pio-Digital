-- ============================================================
-- Migration 046 -- fecha o acesso antigo
-- RODAR LOGO DEPOIS que o deploy do app novo (place_order) estiver no ar.
--
-- Antes disso o app antigo ainda grava pedido direto na tabela e usa as
-- funções de cliente sem token; depois dela, só o caminho seguro da 045
-- funciona.
-- ============================================================

-- 1. Pedido anônimo só pelo place_order (preço calculado no banco).
DROP POLICY IF EXISTS "orders_insert_public" ON orders;
DROP POLICY IF EXISTS "orders_insert_owner" ON orders;
CREATE POLICY "orders_insert_owner" ON orders
  FOR INSERT WITH CHECK (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));

-- 2. Lançamento de pedido só some via cancel_order (com estoque e status
-- juntos); o lojista apaga à mão apenas os lançamentos manuais.
DROP POLICY IF EXISTS "financial_entries_delete_owner" ON financial_entries;
CREATE POLICY "financial_entries_delete_owner" ON financial_entries
  FOR DELETE USING (
    order_id IS NULL AND establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid())
  );

-- 3. Funções antigas de cliente que funcionavam só com o telefone (sem
-- token): qualquer pessoa lia, alterava ou apagava dados de outro cliente.
DROP FUNCTION IF EXISTS get_customer_profile(UUID, TEXT);
DROP FUNCTION IF EXISTS upsert_customer_profile(UUID, TEXT, TEXT, DATE);
DROP FUNCTION IF EXISTS upsert_customer_address(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS delete_customer_address(UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS delete_customer_data(UUID, TEXT);
DROP FUNCTION IF EXISTS get_orders_by_phone(UUID, TEXT);

-- 4. Validação de resgate só pelo check_loyalty_redemption (com token).
REVOKE EXECUTE ON FUNCTION validate_loyalty_redemption(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION validate_loyalty_redemption(UUID, UUID, TEXT) TO service_role;
