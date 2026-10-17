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
