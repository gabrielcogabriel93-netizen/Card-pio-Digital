// Públicos das notificações da loja (compartilhado entre painel e servidor).
export type Audience = 'all' | 'recent' | 'inactive' | 'birthday' | 'customer'

export const AUDIENCE_LABELS: Record<Audience, string> = {
  all: 'Todos com avisos ativos',
  recent: 'Pediram nos últimos 30 dias',
  inactive: 'Sumidos (não pedem há um tempo)',
  birthday: 'Aniversariantes de hoje',
  customer: 'Um cliente',
}

export const PUSH_TITLE_MAX = 60
export const PUSH_BODY_MAX = 180
