// Preço do plano Completo -- constante simples de ajustar (diferente
// do Essencial, que continua vindo de platform_settings.monthly_price,
// editável pelo admin em /admin). Trocar aqui não precisa de migração
// nem mexe no banco, só um novo deploy do app.
export const COMPLETO_MONTHLY_PRICE = 97.0

export type PlanTier = 'essencial' | 'completo'

export const ESSENCIAL_FEATURES = [
  'Cardápio digital ilimitado',
  'Pedidos via WhatsApp',
  'Entrega e retirada',
  'Perfil completo da loja',
  'Link personalizado',
  'PWA instalável',
  'Combos de produtos',
]

export const COMPLETO_FEATURES = [
  ...ESSENCIAL_FEATURES,
  'Controle de estoque',
  'Balcão / PDV',
  'Programa de fidelidade',
  'Cupons de desconto',
  'Pix automático',
  'Cardápio de mesa com QR Code',
  'Relatórios financeiros',
]
