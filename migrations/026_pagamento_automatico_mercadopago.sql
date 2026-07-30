-- ============================================================
-- CARDÁPIO SaaS - Migration 026
-- Pagamento automático via Mercado Pago (Connect/OAuth + split).
--
-- Modelo: o estabelecimento conecta a PRÓPRIA conta Mercado Pago via
-- OAuth. Todo pagamento Pix é criado usando o access_token do
-- estabelecimento, com `application_fee` — o dinheiro cai direto na conta
-- dele, a comissão da plataforma cai direto na conta da aplicação MP. A
-- plataforma nunca custodia o dinheiro do lojista.
--
-- `mercadopago_accounts` guarda os tokens OAuth — RLS habilitado e SEM
-- NENHUMA POLICY de propósito: nem o dono autenticado lê essa tabela
-- direto (só o service role, a partir de rotas de servidor). Mesmo
-- espírito de nunca expor segredo de serviço externo pro client (ver
-- WHATSAPP_SERVER_SECRET em lib/whatsappServer.ts), mas aqui reforçado
-- porque são credenciais de movimentação de dinheiro de verdade.
-- ============================================================

-- 1. CONTA MERCADO PAGO CONECTADA (1 por estabelecimento)
CREATE TABLE mercadopago_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE NOT NULL UNIQUE,
  mp_user_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  public_key TEXT,
  email TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER update_mercadopago_accounts_updated_at
  BEFORE UPDATE ON mercadopago_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 2. ESTADO TEMPORÁRIO DO FLUXO OAUTH (proteção CSRF do "Conectar")
-- Uma linha por tentativa de conexão, expira sozinha (checado na hora do
-- callback) — não precisa de job de limpeza, o volume é desprezível.
CREATE TABLE mercadopago_oauth_states (
  state TEXT PRIMARY KEY,
  establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE mercadopago_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mercadopago_oauth_states ENABLE ROW LEVEL SECURITY;
-- Nenhuma CREATE POLICY aqui de propósito — RLS habilitado sem policy
-- bloqueia geral, só o service role (createAdminClient) passa por cima.

-- 3. MODELO DE COBRANÇA DO ESTABELECIMENTO PRA PLATAFORMA
-- "mensalidade" existe como opção visível na UI mas ainda não tem
-- cobrança recorrente implementada (fica "em breve") — só "comissao"
-- libera o Pix automático no checkout.
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS billing_mode TEXT NOT NULL DEFAULT 'comissao'
  CHECK (billing_mode IN ('comissao', 'mensalidade'));

-- 4. STATUS DE PAGAMENTO DO PEDIDO
-- Independente do `status` do Kanban (que o lojista controla manualmente).
-- Fica NULL pra qualquer pedido que não seja pago via Mercado Pago —
-- pagamento manual (dinheiro, Pix copia-e-cola, cartão na entrega)
-- continua sem rastrear isso, sem mudança de comportamento.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT
  CHECK (payment_status IN ('pending', 'approved', 'rejected', 'cancelled'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mercadopago_payment_id TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_mercadopago_payment_id ON orders(mercadopago_payment_id) WHERE mercadopago_payment_id IS NOT NULL;

-- ============================================================
-- VIEW PÚBLICA: único sinal que o cardápio público recebe é um boolean
-- — nunca token, nunca e-mail, nunca id de conta.
-- CREATE OR REPLACE VIEW só aceita adicionar coluna no final.
-- ============================================================
CREATE OR REPLACE VIEW public_establishments AS
SELECT
  e.id,
  e.name,
  e.slug,
  e.whatsapp_number,
  e.logo_url,
  e.theme_color,
  e.address,
  e.opening_hours,
  e.is_open,
  e.delivery_fee,
  e.offers_delivery,
  e.offers_pickup,
  e.order_tracking_enabled,
  e.use_neighborhood_delivery_fee,
  e.birthday_discount_percent,
  e.free_shipping_threshold,
  e.pix_key,
  e.pix_city,
  e.custom_domain,
  EXISTS (
    SELECT 1 FROM mercadopago_accounts ma
    WHERE ma.establishment_id = e.id AND ma.is_active = true
  ) AND e.billing_mode = 'comissao' AS mercadopago_pix_enabled
FROM establishments e;

GRANT SELECT ON public_establishments TO anon, authenticated;

-- ============================================================
-- get_order_status ganha payment_status — usado pelo checkout (polling
-- enquanto aguarda o Pix cair) e pela página pública de acompanhamento.
-- Muda o RETURNS TABLE, então precisa DROP antes (mesma observação já
-- registrada nas migrations 011/017).
-- ============================================================
DROP FUNCTION IF EXISTS get_order_status(UUID);

CREATE OR REPLACE FUNCTION get_order_status(p_order_id UUID)
RETURNS TABLE(
  id UUID,
  status TEXT,
  customer_name TEXT,
  items JSONB,
  subtotal NUMERIC,
  shipping_fee NUMERIC,
  discount NUMERIC,
  total NUMERIC,
  order_type TEXT,
  delivery_address JSONB,
  payment_method TEXT,
  coupon_code TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ,
  establishment_name TEXT,
  establishment_slug TEXT,
  establishment_theme_color TEXT,
  order_tracking_enabled BOOLEAN,
  payment_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT o.id, o.status, o.customer_name, o.items, o.subtotal, o.shipping_fee,
         o.discount, o.total, o.order_type, o.delivery_address, o.payment_method,
         o.coupon_code, o.notes, o.created_at,
         e.name, e.slug, e.theme_color, COALESCE(e.order_tracking_enabled, true),
         o.payment_status
  FROM orders o
  JOIN establishments e ON e.id = o.establishment_id
  WHERE o.id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_order_status(UUID) TO anon, authenticated;
