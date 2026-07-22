-- ============================================================
-- CARDÁPIO SaaS - Migration 004
-- Bucket de storage para upload de imagens (produtos e logo) direto
-- do dispositivo do lojista, substituindo o campo de URL manual.
-- Estrutura dos arquivos: uploads/{establishment_id}/{products|logo}/{arquivo}
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('uploads', 'uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Leitura pública (necessário para exibir as imagens no cardápio público)
CREATE POLICY "uploads_select_public" ON storage.objects
  FOR SELECT USING (bucket_id = 'uploads');

-- Apenas o dono do estabelecimento pode enviar arquivos na sua própria pasta
CREATE POLICY "uploads_insert_owner" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'uploads'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM establishments WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "uploads_update_owner" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'uploads'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM establishments WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "uploads_delete_owner" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'uploads'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM establishments WHERE owner_id = auth.uid()
    )
  );
