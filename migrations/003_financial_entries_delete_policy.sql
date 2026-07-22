-- ============================================================
-- CARDÁPIO SaaS - Migration 003
-- Permite ao lojista excluir lançamentos financeiros manuais
-- (a tela Financeiro ganhou um botão de excluir para corrigir
-- lançamentos de entrada/saída cadastrados por engano).
-- ============================================================

CREATE POLICY "financial_entries_delete_owner" ON financial_entries
  FOR DELETE USING (
    establishment_id IN (
      SELECT id FROM establishments WHERE owner_id = auth.uid()
    )
  );
