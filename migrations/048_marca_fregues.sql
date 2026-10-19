-- ============================================================
-- Migration 048 -- restos da marca antiga no banco
-- (pode rodar a qualquer momento; o app já trata os dois casos).
-- ============================================================

-- 1. Cor padrão: o verde da marca antiga vira o azul Freguês. Só muda
-- quem ficou com o padrão (o seletor é livre, ninguém digitou esse
-- valor exato de propósito).
ALTER TABLE establishments ALTER COLUMN theme_color SET DEFAULT '#2340E0';
UPDATE establishments SET theme_color = '#2340E0' WHERE lower(theme_color) = '#22c55e';

-- 2. Loja demo da landing: nome e endereço na marca Freguês.
UPDATE establishments
SET name = 'Pizzaria Demo', slug = 'pizzaria-demo',
    delivery_time_min = COALESCE(delivery_time_min, 30),
    delivery_time_max = COALESCE(delivery_time_max, 45)
WHERE slug LIKE 'pizzaria-demo-%'
  AND NOT EXISTS (SELECT 1 FROM establishments WHERE slug = 'pizzaria-demo');
