// Etapa de cada contato no funil do Freguês e a mensagem de WhatsApp que
// faz sentido para ela. Usado na lista de contatos e nas métricas.

export type GrowthStage =
  | 'iniciou'          // passo 1 do cadastro, ainda sem conta
  | 'conta_criada'     // conta criada, loja não (e-mail não confirmado)
  | 'loja_criada'      // loja criada, sem produto
  | 'cardapio'         // tem produto, ainda sem pedido
  | 'primeiro_pedido'  // já recebeu pedido (ativado)
  | 'assinante'        // pagando
  | 'teste_vencido'    // teste acabou e não assinou
  | 'cancelado'        // pagou e deixou de pagar

export const STAGE_LABELS: Record<GrowthStage, string> = {
  iniciou: 'Iniciou o cadastro',
  conta_criada: 'Conta criada (sem loja)',
  loja_criada: 'Loja criada (sem produtos)',
  cardapio: 'Cardápio montado (sem pedidos)',
  primeiro_pedido: 'Recebendo pedidos',
  assinante: 'Assinante',
  teste_vencido: 'Teste vencido',
  cancelado: 'Cancelou',
}

export const STAGE_ORDER: GrowthStage[] = ['iniciou', 'conta_criada', 'loja_criada', 'cardapio', 'primeiro_pedido', 'assinante', 'teste_vencido', 'cancelado']

export interface StageStore {
  subscription_status: string | null
  trial_ends_at: string | null
  current_period_end: string | null
}

export interface StageStats {
  products_count: number
  orders_total: number
}

export interface StageInput {
  hasAccount: boolean
  store?: StageStore | null
  stats?: StageStats | null
  billingEnabled: boolean
  everPaid?: boolean
  now?: Date
}

export function isPaying(store: StageStore, now = new Date()): boolean {
  return store.subscription_status === 'active' && (!store.current_period_end || new Date(store.current_period_end) > now)
}

export function stageOf(input: StageInput): GrowthStage {
  const now = input.now || new Date()
  const s = input.store
  if (!s) return input.hasAccount ? 'conta_criada' : 'iniciou'
  if (isPaying(s, now)) return 'assinante'
  if (s.subscription_status === 'active' || input.everPaid) return 'cancelado'
  if (input.billingEnabled && s.subscription_status === 'trial' && s.trial_ends_at && new Date(s.trial_ends_at) <= now) return 'teste_vencido'
  if ((input.stats?.orders_total || 0) > 0) return 'primeiro_pedido'
  if ((input.stats?.products_count || 0) > 0) return 'cardapio'
  return 'loja_criada'
}

const firstName = (name?: string | null) => (name || '').trim().split(/\s+/)[0] || ''

/** Mensagem pronta para a equipe mandar no WhatsApp, conforme a etapa. */
export function stageMessage(stage: GrowthStage, opts: { name?: string | null; storeName?: string | null; trialDaysLeft?: number | null; senderName?: string | null }): string {
  const oi = `Oi${firstName(opts.name) ? `, ${firstName(opts.name)}` : ''}! ${opts.senderName ? `Aqui é ${opts.senderName}, do Freguês.` : 'Aqui é do Freguês.'}`
  const loja = opts.storeName ? ` da ${opts.storeName}` : ''
  const left = opts.trialDaysLeft
  if (left != null && left >= 0 && left <= 5 && (stage === 'loja_criada' || stage === 'cardapio' || stage === 'primeiro_pedido')) {
    const quando = left === 0 ? 'hoje' : left === 1 ? 'amanhã' : `em ${left} dias`
    return `${oi} O teste grátis${loja} termina ${quando}. Quer que eu te ajude a escolher o plano para não parar de receber pedidos?`
  }
  switch (stage) {
    case 'iniciou':
      return `${oi} Vi que você começou a criar sua loja e parou no meio. Posso te ajudar a terminar? Leva uns 2 minutos.`
    case 'conta_criada':
      return `${oi} Sua conta foi criada, só falta confirmar o e-mail para a loja ficar pronta. Chegou o e-mail de confirmação? Se precisar, te ajudo por aqui.`
    case 'loja_criada':
      return `${oi} Sua loja${loja} já está criada! Quer ajuda para cadastrar o cardápio? Se me mandar uma foto do seu cardápio, eu te mostro o jeito mais rápido.`
    case 'cardapio':
      return `${oi} Vi que o cardápio${loja} já está no ar. Já divulgou o link para os clientes? Tenho umas dicas para chegar o primeiro pedido ainda hoje.`
    case 'primeiro_pedido':
      return `${oi} Que bom ver os pedidos chegando${loja}! Está tudo funcionando bem? Quer que eu te mostre a fidelidade e as notificações para fazer o cliente voltar?`
    case 'teste_vencido':
      return `${oi} O teste grátis${loja} terminou. Ficou alguma dúvida sobre os planos? Posso te ajudar a escolher o melhor para o seu negócio.`
    case 'cancelado':
      return `${oi} Vi que a assinatura${loja} foi encerrada. Pode me contar o que faltou? Sua opinião ajuda muito a gente a melhorar.`
    case 'assinante':
    default:
      return `${oi} Passando para saber como está a loja${loja}. Precisa de alguma ajuda com o Freguês?`
  }
}
