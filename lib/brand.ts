// Identidade da plataforma num lugar só. Trocar o nome ou as cores da
// marca é mexer aqui (e nos ícones em public/icons), sem caçar texto
// espalhado pelo app. A marca de cada LOJA (nome, logo, cor) nunca vem
// daqui: vem do cadastro do estabelecimento.
export const BRAND = {
  name: 'Freguês',
  // Forma em minúsculas usada na assinatura visual (wordmark).
  wordmark: 'freguês',
  tagline: 'Seu cliente vira freguês.',
  description: 'Cardápio digital com pedido direto, sem comissão, e fidelidade que faz o cliente voltar.',
  // Paleta: azul caneta (marca), amarelo comanda (destaque), nanquim (texto).
  colors: {
    blue: '#2340E0',
    yellow: '#FFD43B',
    ink: '#14172B',
    paper: '#F6F7FB',
    success: '#0B8A5F',
  },
} as const

// Navegador guarda favicon por semanas: trocar a versão força todo mundo
// a baixar os ícones de novo (usar em toda URL de /icons, favicon e svg).
export const ICON_VERSION = '2'
export const iconUrl = (path: string) => `${path}?v=${ICON_VERSION}`

// Cor padrão da marca antiga. Loja que nunca escolheu cor ficou com ela
// gravada; a partir de agora vale o azul Freguês no lugar.
export const LEGACY_STORE_COLOR = '#22c55e'
export const DEFAULT_STORE_COLOR = BRAND.colors.blue

export function storeColor(color: string | null | undefined): string {
  if (!color || color.trim().toLowerCase() === LEGACY_STORE_COLOR) return DEFAULT_STORE_COLOR
  return color
}

export function isCustomStoreColor(color: string | null | undefined): boolean {
  return storeColor(color).toLowerCase() !== DEFAULT_STORE_COLOR.toLowerCase()
}
