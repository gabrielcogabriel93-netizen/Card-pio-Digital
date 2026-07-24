-- ============================================================
-- CARDÁPIO SaaS - Migration 023
-- Liga/desliga as notificações automáticas de status via WhatsApp
-- (WPPConnect, servidor separado em whatsapp-server/). Desligado por
-- padrão — é uma automação não-oficial do WhatsApp, o lojista precisa
-- ativar conscientemente (ver aviso na página /painel/whatsapp).
-- ============================================================

ALTER TABLE establishments ADD COLUMN IF NOT EXISTS whatsapp_notifications_enabled BOOLEAN DEFAULT false;
