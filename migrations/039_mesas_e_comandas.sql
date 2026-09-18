-- ============================================================
-- CatalogAI - Migration 039
-- Cardápio de mesa com QR Code: terceiro fluxo de pedido, diferente do
-- online (checkout único -> WhatsApp) e do balcão (venda avulsa que já
-- nasce concluída). Aqui múltiplos pedidos se acumulam numa "comanda"
-- (table_tabs) aberta por mesa (restaurant_tables) enquanto o cliente
-- está sentado, e o garçom soma e fecha tudo de uma vez no painel.
--
-- Pagamento no fechamento é MANUAL nesta v1 (decisão de escopo): o
-- sistema só soma e marca como paga — a cobrança física continua
-- acontecendo na mesa, fora do sistema.
-- ============================================================

CREATE TABLE restaurant_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE NOT NULL,
  label TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (establishment_id, label)
);

CREATE INDEX idx_restaurant_tables_establishment_id ON restaurant_tables(establishment_id);

-- Uma mesa pode ter várias table_tabs ao longo do tempo (uma por
-- "sessão" de clientes), mas só UMA aberta por vez — garantido pelo
-- índice único parcial abaixo, que também é o conflict target do
-- INSERT ... ON CONFLICT em get_or_create_table_tab().
CREATE TABLE table_tabs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID REFERENCES establishments(id) ON DELETE CASCADE NOT NULL,
  table_id UUID REFERENCES restaurant_tables(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  closed_total NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_table_tabs_one_open_per_table ON table_tabs(table_id) WHERE (status = 'open');
CREATE INDEX idx_table_tabs_establishment_status ON table_tabs(establishment_id, status);

-- Nullable: só pedidos source='mesa' preenchem isso (validado pelo
-- trigger mais abaixo).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_tab_id UUID REFERENCES table_tabs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_table_tab_id ON orders(table_tab_id);

-- order_type hoje só aceita 'delivery'/'pickup' (migration 010, CHECK
-- inline sem nome -> Postgres gerou orders_order_type_check, confirmado
-- por leitura direta da migration). Pedido de mesa não é nem uma coisa
-- nem outra.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_type_check;
ALTER TABLE orders ADD CONSTRAINT orders_order_type_check
  CHECK (order_type IN ('delivery', 'pickup', 'mesa'));

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_tabs ENABLE ROW LEVEL SECURITY;

-- MESAS: só o dono mexe (CRUD completo pelo painel). Sem policy pública
-- — o cardápio público nunca lê esta tabela direto, só via
-- get_or_create_table_tab() (SECURITY DEFINER, abaixo). Sem
-- delete_owner de propósito: a UI só oferece ativar/desativar
-- (is_active), nunca apagar — evita órfãos em table_tabs/orders.
CREATE POLICY "restaurant_tables_select_owner" ON restaurant_tables
  FOR SELECT USING (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));
CREATE POLICY "restaurant_tables_insert_owner" ON restaurant_tables
  FOR INSERT WITH CHECK (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));
CREATE POLICY "restaurant_tables_update_owner" ON restaurant_tables
  FOR UPDATE USING (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));

-- COMANDAS: só o dono lê/atualiza (painel de Mesas + close_table_tab).
-- Sem insert_owner: comandas só nascem via get_or_create_table_tab(),
-- nunca por insert direto.
CREATE POLICY "table_tabs_select_owner" ON table_tabs
  FOR SELECT USING (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));
CREATE POLICY "table_tabs_update_owner" ON table_tabs
  FOR UPDATE USING (establishment_id IN (SELECT id FROM establishments WHERE owner_id = auth.uid()));

-- ============================================================
-- FUNÇÃO PÚBLICA: abre ou reusa a comanda da mesa
-- ============================================================
-- Chamada pelo cardápio público (anon) assim que detecta ?mesa=<id> na
-- URL. "existe comanda aberta pra essa mesa? reusa : cria" de forma
-- atômica (ON CONFLICT no índice único parcial evita corrida se dois
-- clientes abrirem o link quase ao mesmo tempo). Devolve só o
-- necessário — nunca expõe restaurant_tables/table_tabs inteiras.
CREATE OR REPLACE FUNCTION get_or_create_table_tab(p_establishment_id UUID, p_table_id UUID)
RETURNS TABLE(tab_id UUID, table_label TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table_label TEXT;
  v_tab_id UUID;
BEGIN
  SELECT label INTO v_table_label FROM restaurant_tables
  WHERE id = p_table_id AND establishment_id = p_establishment_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mesa não encontrada ou inativa.';
  END IF;

  INSERT INTO table_tabs (establishment_id, table_id, status)
  VALUES (p_establishment_id, p_table_id, 'open')
  ON CONFLICT (table_id) WHERE (status = 'open') DO NOTHING
  RETURNING id INTO v_tab_id;

  IF v_tab_id IS NULL THEN
    SELECT id INTO v_tab_id FROM table_tabs WHERE table_id = p_table_id AND status = 'open';
  END IF;

  RETURN QUERY SELECT v_tab_id, v_table_label;
END;
$$;

GRANT EXECUTE ON FUNCTION get_or_create_table_tab(UUID, UUID) TO anon, authenticated;

-- ============================================================
-- TRIGGER DE PROTEÇÃO: valida pedido de mesa no INSERT
-- ============================================================
-- Mesmo espírito de trg_prevent_order_spam (migration 006): reforça no
-- BANCO, não só no client. SECURITY DEFINER é OBRIGATÓRIO aqui — sem
-- isso, a função rodaria com o privilégio de quem disparou o INSERT
-- (o visitante anônimo), e como não existe nenhuma policy pública de
-- SELECT em table_tabs/orders, o SELECT abaixo nunca encontraria nada
-- e todo pedido de mesa falharia com "Comanda não encontrada" mesmo
-- sendo válido. A função só FAZ LEITURAS (nunca escreve), então o
-- bypass de RLS aqui é seguro.
CREATE OR REPLACE FUNCTION validate_table_order()
RETURNS TRIGGER AS $$
DECLARE
  v_tab RECORD;
  v_recent_count INT;
BEGIN
  IF NEW.table_tab_id IS NULL THEN
    RAISE EXCEPTION 'Pedido de mesa precisa informar a comanda (table_tab_id).';
  END IF;

  SELECT establishment_id, status INTO v_tab FROM table_tabs WHERE id = NEW.table_tab_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comanda não encontrada.';
  END IF;

  IF v_tab.establishment_id <> NEW.establishment_id THEN
    RAISE EXCEPTION 'Comanda não pertence a este estabelecimento.';
  END IF;

  IF v_tab.status <> 'open' THEN
    RAISE EXCEPTION 'Essa comanda já foi fechada. Peça para o garçom abrir uma nova.';
  END IF;

  -- Sem telefone confiável pra chavear (mesa pede só nome), o limite é
  -- por comanda — generoso o bastante pra várias rodadas de pedido
  -- legítimas, apertado o bastante pra travar script.
  SELECT COUNT(*) INTO v_recent_count FROM orders
  WHERE table_tab_id = NEW.table_tab_id AND created_at > now() - INTERVAL '2 minutes';

  IF v_recent_count >= 5 THEN
    RAISE EXCEPTION 'Muitos pedidos em pouco tempo para esta mesa. Aguarde alguns minutos e tente novamente.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_validate_table_order ON orders;
CREATE TRIGGER trg_validate_table_order
  BEFORE INSERT ON orders
  FOR EACH ROW
  WHEN (NEW.source = 'mesa')
  EXECUTE FUNCTION validate_table_order();

-- ============================================================
-- FECHAMENTO DA COMANDA (autenticado, dono)
-- ============================================================
-- De propósito SEM SECURITY DEFINER: roda com o privilégio de quem
-- chamou (o dono logado), então toda leitura/escrita aqui já passa
-- pelas policies "_owner" que já existem — chamar isso autenticado
-- como outra loja simplesmente não encontra a comanda (RLS filtra a
-- linha) e cai no RAISE EXCEPTION de "não encontrada".
--
-- NÃO conclui pedidos pendentes/em preparo em lote e não baixa
-- estoque — isso já é feito pelo Kanban de Pedidos (handleUpdateStatus
-- em app/painel/pedidos/page.tsx), única fonte de verdade pra
-- status/estoque. Exige que TODOS os pedidos da comanda já estejam
-- completed/cancelled; senão, erro pedindo pra concluir no Kanban
-- primeiro.
CREATE OR REPLACE FUNCTION close_table_tab(p_tab_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_tab RECORD;
  v_open_orders INT;
  v_total NUMERIC(10,2);
BEGIN
  SELECT * INTO v_tab FROM table_tabs WHERE id = p_tab_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comanda não encontrada ou você não tem acesso a ela.';
  END IF;

  IF v_tab.status <> 'open' THEN
    RAISE EXCEPTION 'Essa comanda já foi fechada.';
  END IF;

  SELECT COUNT(*) INTO v_open_orders FROM orders
  WHERE table_tab_id = p_tab_id AND status NOT IN ('completed', 'cancelled');

  IF v_open_orders > 0 THEN
    RAISE EXCEPTION 'Essa comanda ainda tem % pedido(s) não concluído(s). Finalize todos os pedidos da mesa em Pedidos antes de fechar a conta.', v_open_orders;
  END IF;

  SELECT COALESCE(SUM(total), 0) INTO v_total FROM orders
  WHERE table_tab_id = p_tab_id AND status = 'completed';

  -- Uma entrada financeira POR PEDIDO (não consolidada), pra manter
  -- rastreabilidade via financial_entries.order_id — mesmo padrão do
  -- fluxo online/balcão. NOT EXISTS evita duplicar em chamada repetida.
  INSERT INTO financial_entries (establishment_id, order_id, type, amount, description)
  SELECT o.establishment_id, o.id, 'income', o.total,
         'Comanda mesa - pedido #' || substr(o.id::text, 1, 8)
  FROM orders o
  WHERE o.table_tab_id = p_tab_id AND o.status = 'completed'
    AND NOT EXISTS (SELECT 1 FROM financial_entries fe WHERE fe.order_id = o.id);

  UPDATE table_tabs SET status = 'closed', closed_at = now(), closed_total = v_total WHERE id = p_tab_id;

  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION close_table_tab(UUID) TO authenticated;
