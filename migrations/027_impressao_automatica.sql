-- ============================================================
-- CARDÁPIO SaaS - Migration 027
-- Impressão automática de comanda: quando ligado, a comanda do pedido
-- novo é impressa sozinha (window.print() disparado pelo próprio painel,
-- ver app/painel/pedidos/page.tsx) — sem o lojista precisar clicar em
-- nada. Só funciona com a aba /painel/pedidos aberta no computador que
-- tem a impressora, e sempre usa a impressora padrão do Windows daquele
-- PC (o navegador não deixa escolher isso por código).
--
-- `auto_print_enabled` fica NULL até o lojista decidir (dispara o banner
-- de primeira vez no painel) — só true/false depois de uma escolha
-- explícita. `printer_label` é só um apelido/lembrete em texto, não um
-- seletor funcional.
-- ============================================================

ALTER TABLE establishments ADD COLUMN IF NOT EXISTS auto_print_enabled BOOLEAN;
ALTER TABLE establishments ADD COLUMN IF NOT EXISTS printer_label TEXT;
