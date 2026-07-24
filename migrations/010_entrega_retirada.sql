-- ============================================================
-- CARDÁPIO SaaS - Migration 010
-- Tipo de pedido (entrega x retirada no local) + endereço de entrega
-- estruturado.
--
-- Antes disso, o cardápio público cobrava taxa de entrega em TODO
-- pedido, sem nunca perguntar o endereço do cliente (só existia o campo
-- livre "Observações", sem estrutura, fácil de esquecer). Agora o
-- cliente escolhe entrega ou retirada; a taxa só é cobrada se for
-- entrega, e o endereço vem em colunas próprias, não amarrado em texto
-- livre.
-- ============================================================

-- O lojista decide quais modalidades aceita (podem ser as duas).
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS offers_delivery BOOLEAN DEFAULT true;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS offers_pickup BOOLEAN DEFAULT true;

-- Tipo do pedido e endereço (só preenchido quando order_type = 'delivery').
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type TEXT NOT NULL DEFAULT 'delivery'
  CHECK (order_type IN ('delivery', 'pickup'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address JSONB;

-- View pública precisa expor as duas nova flags para o cardápio saber
-- quais opções mostrar ao cliente.
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
  offers_pickup
FROM establishments;

GRANT SELECT ON public_establishments TO anon, authenticated;
