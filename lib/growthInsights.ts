// Parecer automático da aba Crescimento: lê as métricas e aponta o que
// precisa de atenção, com o motivo e o que fazer. Regras simples e
// transparentes (referências usuais de SaaS para pequenos negócios),
// para a equipe entender e confiar em cada recomendação.
import type { GrowthMetrics, LeadFlag } from './growthMetrics'
import { formatBRL } from './money'

export type InsightArea = 'saude' | 'aquisicao' | 'ativacao' | 'engajamento' | 'retencao' | 'receita' | 'conversao' | 'satisfacao' | 'acoes'
export type InsightSeverity = 'critico' | 'atencao' | 'bom' | 'info'

export interface Insight {
  area: InsightArea
  severity: InsightSeverity
  title: string
  detail: string
  action: string
  filter?: LeadFlag
}

export const AREA_LABELS: Record<InsightArea, string> = {
  saude: 'Saúde do sistema',
  aquisicao: 'Aquisição',
  ativacao: 'Ativação',
  engajamento: 'Engajamento',
  retencao: 'Retenção',
  receita: 'Receita',
  conversao: 'Conversão',
  satisfacao: 'Satisfação',
  acoes: 'Contatos para hoje',
}

// Referências mostradas na tela junto de cada número.
export const BENCHMARKS = {
  visitorToLead: 3,      // % de visitantes que começam o cadastro
  leadToStore: 60,       // % de quem começa e termina a loja
  products: 60,          // % das lojas novas com cardápio montado
  firstOrder: 40,        // % das lojas novas com 1º pedido
  stickiness: 20,        // DAU/MAU em %
  monthlyChurn: 5,       // % ao mês (máximo saudável)
  trialToPaid: 15,       // % de testes que viram assinatura
  checkoutAbandon: 40,   // % máximo de checkouts abandonados
  nps: 30,               // NPS bom
  csat: 4.3,             // nota média dos clientes finais
}

const SEVERITY_ORDER: Record<InsightSeverity, number> = { critico: 0, atencao: 1, info: 2, bom: 3 }

export function buildInsights(m: GrowthMetrics, opts: { billingEnabled: boolean }): { items: Insight[]; bottleneck: Insight | null } {
  const items: Insight[] = []
  const add = (i: Insight) => items.push(i)
  const p = (n: number | null) => (n == null ? '-' : `${String(n).replace('.', ',')}%`)

  // Saúde
  if (m.health.cronMinutesAgo == null || m.health.cronMinutesAgo > 10) {
    add({ area: 'saude', severity: 'critico', title: 'O agendador do sistema parou',
      detail: m.health.cronMinutesAgo == null ? 'Não há registro de execução.' : `Última execução há ${m.health.cronMinutesAgo} minutos (deveria ser a cada minuto).`,
      action: 'Sem ele não rodam a automação de pedidos, o aviso de loja aberta e os avisos para você. Confira o cron no Supabase (CRON_TRIGGER_SECRET).' })
  }
  if (m.health.criticalErrors24h >= 3) {
    add({ area: 'saude', severity: 'atencao', title: `${m.health.criticalErrors24h} erros críticos nas últimas 24 horas`,
      detail: 'Erros críticos são pedidos que não foram enviados, telas que quebraram ou vendas que não fecharam.', action: 'Abra a aba Logs e resolva os mais repetidos primeiro.' })
  }

  // Aquisição
  const a = m.acquisition
  if (a.visitors === 0) {
    add({ area: 'aquisicao', severity: 'atencao', title: 'Nenhuma visita registrada no período',
      detail: 'A contagem de visitas começa a partir desta versão.', action: 'Divulgue o site com o link marcado (ex.: ?utm_source=instagram) para saber de onde vêm os cadastros.' })
  } else if (a.visitors >= 50 && a.visitorToLead != null && a.visitorToLead < BENCHMARKS.visitorToLead) {
    add({ area: 'aquisicao', severity: 'atencao', title: 'Poucos visitantes começam o cadastro',
      detail: `${p(a.visitorToLead)} dos ${a.visitors} visitantes começaram (referência: ${BENCHMARKS.visitorToLead}% ou mais).`,
      action: 'Reforce no site o "30 dias grátis, sem cartão", mostre prints reais e depoimentos de lojistas, e deixe o botão de cadastro sempre visível.' })
  }
  if (a.leads >= 5 && a.leadToStore != null && a.leadToStore < BENCHMARKS.leadToStore) {
    add({ area: 'aquisicao', severity: a.leadToStore < 40 ? 'critico' : 'atencao', title: 'Muita gente para no meio do cadastro',
      detail: `Só ${p(a.leadToStore)} de quem começou chegou a criar a loja (referência: ${BENCHMARKS.leadToStore}%).`,
      action: 'Chame no WhatsApp quem parou (lista abaixo) e confira se o e-mail de confirmação está chegando (caixa de spam).', filter: 'parados_cadastro' })
  }
  if (a.cac != null && m.revenue.arpu != null && a.cac > m.revenue.arpu * 3) {
    add({ area: 'aquisicao', severity: 'atencao', title: 'Custo para conquistar cada assinante está alto',
      detail: `CAC de ${formatBRL(a.cac)}: cada assinante leva ${Math.ceil(a.cac / m.revenue.arpu)} meses para pagar o investimento.`,
      action: 'Concentre o investimento no canal que mais traz lojas (tabela de origens) e reforce indicação entre lojistas.' })
  }
  if (a.spend === 0 && a.leads > 0) {
    add({ area: 'aquisicao', severity: 'info', title: 'Registre quanto foi investido em divulgação',
      detail: 'Sem o valor investido não dá para calcular o CAC (custo por cliente).', action: 'Lance o investimento do mês na seção Investimento.' })
  }
  const best = a.sources.filter((s) => s.source !== 'direto').sort((x, y) => y.stores - x.stores)[0]
  if (best && best.stores >= 2) {
    add({ area: 'aquisicao', severity: 'bom', title: `${best.source} é o canal que mais traz lojas`,
      detail: `${best.stores} lojas criadas e ${best.paying} assinantes vindos de ${best.source} no período.`, action: 'Vale reforçar esse canal.' })
  }

  // Ativação
  const act = m.activation
  if (act.cohort >= 3 && act.products != null && act.products < BENCHMARKS.products) {
    add({ area: 'ativacao', severity: 'critico', title: 'Lojas novas não estão montando o cardápio',
      detail: `${p(act.products)} das ${act.cohort} lojas novas cadastraram produto (referência: ${BENCHMARKS.products}%).`,
      action: 'Ligue ou mande WhatsApp nas primeiras 24 horas e ofereça cadastrar o cardápio junto, a partir de uma foto.', filter: 'sem_produto' })
  }
  if (act.cohort >= 3 && act.firstOrder != null && act.firstOrder < BENCHMARKS.firstOrder) {
    add({ area: 'ativacao', severity: 'atencao', title: 'Poucas lojas novas recebem o primeiro pedido',
      detail: `${p(act.firstOrder)} das lojas novas já receberam pedido (referência: ${BENCHMARKS.firstOrder}%).`,
      action: 'Ensine a divulgar: link na bio, status do WhatsApp, QR na mesa e o adesivo na sacola (aba Divulgar). O 1º pedido é o que segura o lojista.', filter: 'sem_pedido' })
  }
  if (act.medianDaysToFirstOrder != null && act.medianDaysToFirstOrder > 7) {
    add({ area: 'ativacao', severity: 'atencao', title: 'O primeiro pedido está demorando',
      detail: `Metade das lojas leva mais de ${String(act.medianDaysToFirstOrder).replace('.', ',')} dias para receber o 1º pedido.`,
      action: 'Com 30 dias de teste, o ideal é o 1º pedido na primeira semana. Faça um acompanhamento no 3º dia.' })
  }
  if (act.cohort >= 3 && act.firstOrder != null && act.firstOrder >= BENCHMARKS.firstOrder) {
    add({ area: 'ativacao', severity: 'bom', title: 'Boa ativação', detail: `${p(act.firstOrder)} das lojas novas já receberam pedido.`, action: 'Mantenha o acompanhamento nos primeiros dias.' })
  }

  // Engajamento
  const e = m.engagement
  if (e.mau >= 5 && e.stickiness != null && e.stickiness < BENCHMARKS.stickiness) {
    add({ area: 'engajamento', severity: 'atencao', title: 'Lojistas abrem pouco o painel',
      detail: `Uso diário/mensal de ${p(e.stickiness)} (referência: ${BENCHMARKS.stickiness}% ou mais).`,
      action: 'Lojas que recebem pedidos todo dia usam o painel todo dia: o foco é gerar pedidos (divulgação, notificações, fidelidade).' })
  }
  if (e.totalStores >= 5 && e.mau / e.totalStores < 0.5) {
    add({ area: 'engajamento', severity: 'atencao', title: 'Mais da metade das lojas não abriu o painel no mês',
      detail: `${e.mau} de ${e.totalStores} lojas usaram o painel nos últimos 30 dias.`, action: 'Faça uma rodada de contato com as lojas paradas.' })
  }

  // Retenção
  const r = m.retention
  if (r.monthlyChurn != null && r.monthlyChurn > BENCHMARKS.monthlyChurn) {
    add({ area: 'retencao', severity: r.monthlyChurn > 10 ? 'critico' : 'atencao', title: 'Cancelamentos acima do saudável',
      detail: `Cancelamento de ${p(r.monthlyChurn)} ao mês (referência: até ${BENCHMARKS.monthlyChurn}%).`,
      action: 'Pergunte a cada loja que cancelou o motivo e acompanhe de perto quem está sem usar.', filter: 'assinante_inativo' })
  }
  if (r.atRisk > 0) {
    add({ area: 'retencao', severity: 'atencao', title: `${r.atRisk} assinante(s) sem usar há mais de 7 dias`,
      detail: 'Assinante que não recebe pedido nem abre o painel costuma cancelar na próxima cobrança.', action: 'Chame para entender e ajudar a gerar pedidos.', filter: 'assinante_inativo' })
  }
  const lastFull = r.cohorts.filter((c) => c.size >= 3 && c.m1 != null).pop()
  if (lastFull && lastFull.m1! < 40) {
    add({ area: 'retencao', severity: 'atencao', title: 'Muitas lojas param de usar no mês seguinte ao cadastro',
      detail: `Das lojas criadas em ${lastFull.month}, só ${p(lastFull.m1)} continuaram ativas no mês seguinte.`, action: 'Reforce o acompanhamento dos primeiros 30 dias.' })
  }

  // Receita
  const rev = m.revenue
  if (opts.billingEnabled && rev.paying === 0) {
    add({ area: 'receita', severity: 'atencao', title: 'Ainda não há assinantes pagando',
      detail: 'O MRR é zero.', action: 'Acompanhe os testes perto do fim e ajude cada lojista a escolher o plano.', filter: 'teste_acabando' })
  }
  if (rev.paying >= 5 && rev.payingCompleto / rev.paying < 0.3) {
    add({ area: 'receita', severity: 'info', title: 'Poucos assinantes no plano Completo',
      detail: `${rev.payingCompleto} de ${rev.paying} assinantes estão no Completo.`,
      action: 'Mostre o Pix automático, a fidelidade e as mesas com QR para quem já recebe muitos pedidos.' })
  }

  // Conversão
  const c = m.conversion
  if (c.trialEnded >= 5 && c.trialToPaid != null && c.trialToPaid < BENCHMARKS.trialToPaid) {
    add({ area: 'conversao', severity: c.trialToPaid < 8 ? 'critico' : 'atencao', title: 'Poucos testes viram assinatura',
      detail: `${p(c.trialToPaid)} dos testes encerrados viraram assinatura (referência: ${BENCHMARKS.trialToPaid}% ou mais).`,
      action: 'Fale com cada loja nos últimos 5 dias de teste, principalmente as que já recebem pedidos.', filter: 'teste_acabando' })
  }
  if (c.trialEndingIn7d > 0) {
    add({ area: 'conversao', severity: 'atencao', title: `${c.trialEndingIn7d} teste(s) terminam nos próximos 7 dias`,
      detail: 'É a melhor hora para conversar sobre o plano.', action: 'Veja a lista e chame no WhatsApp.', filter: 'teste_acabando' })
  }
  if (c.checkoutsStarted >= 3 && c.checkoutAbandonRate != null && c.checkoutAbandonRate > BENCHMARKS.checkoutAbandon) {
    add({ area: 'conversao', severity: 'atencao', title: 'Lojistas desistem na hora de pagar',
      detail: `${p(c.checkoutAbandonRate)} de quem abriu o pagamento não concluiu (referência: até ${BENCHMARKS.checkoutAbandon}%).`,
      action: 'Pergunte se houve problema no cartão ou dúvida sobre o plano, e confira o checkout do Stripe.' })
  }

  // Satisfação
  const s = m.satisfaction
  if (s.npsResponses === 0) {
    add({ area: 'satisfacao', severity: 'info', title: 'Ainda sem respostas de NPS',
      detail: 'O painel pergunta a nota para lojas com 14 dias ou mais, a cada 90 dias.', action: 'As respostas aparecem aqui conforme chegam.' })
  } else if (s.nps != null) {
    if (s.nps < 0) add({ area: 'satisfacao', severity: 'critico', title: `NPS negativo (${s.nps})`, detail: `${s.detractors} detratores e ${s.promoters} promotores.`, action: 'Ligue para cada detrator e resolva o problema antes que cancele.' })
    else if (s.nps < BENCHMARKS.nps) add({ area: 'satisfacao', severity: 'atencao', title: `NPS de ${s.nps}`, detail: `Referência: ${BENCHMARKS.nps} ou mais.`, action: 'Leia os comentários dos detratores e corrija os pontos que se repetem.' })
    else add({ area: 'satisfacao', severity: 'bom', title: `NPS de ${s.nps}`, detail: `${s.promoters} promotores.`, action: 'Peça aos promotores que indiquem o Freguês para outros lojistas.' })
  }
  if (s.ticketsOpen > 0) {
    add({ area: 'satisfacao', severity: 'atencao', title: `${s.ticketsOpen} chamado(s) de suporte em aberto`, detail: 'Lojista esperando resposta.', action: 'Responda pela seção Suporte (tem o botão de WhatsApp).' })
  }
  if (s.avgResolutionHours != null && s.avgResolutionHours > 24) {
    add({ area: 'satisfacao', severity: 'atencao', title: 'Chamados demorando para resolver', detail: `Média de ${String(s.avgResolutionHours).replace('.', ',')} horas.`, action: 'O ideal é responder no mesmo dia.' })
  }
  if (s.ratingsCount >= 10 && s.csatAvg != null && s.csatAvg < BENCHMARKS.csat) {
    add({ area: 'satisfacao', severity: 'atencao', title: 'Clientes das lojas avaliando abaixo do ideal',
      detail: `Nota média ${String(s.csatAvg).replace('.', ',')} de 5 nos pedidos do período.`, action: 'Veja quais lojas puxam a média para baixo e ajude com tempo de entrega e comunicação.' })
  }

  // Contatos para hoje
  const fc = m.flagCounts as Partial<Record<LeadFlag, number>>
  const todo: [LeadFlag, string][] = [
    ['followup_hoje', 'retornos marcados para hoje'],
    ['parados_cadastro', 'pessoas que pararam no cadastro'],
    ['sem_produto', 'lojas sem produtos'],
    ['sem_pedido', 'lojas com cardápio e sem pedidos'],
    ['teste_acabando', 'testes acabando'],
    ['assinante_inativo', 'assinantes sumidos'],
  ]
  for (const [flag, label] of todo) {
    const n = fc[flag] || 0
    if (n > 0) add({ area: 'acoes', severity: flag === 'followup_hoje' ? 'atencao' : 'info', title: `${n} ${label}`, detail: 'Cada um tem a mensagem pronta para o WhatsApp.', action: 'Abrir a lista.', filter: flag })
  }

  items.sort((x, y) => SEVERITY_ORDER[x.severity] - SEVERITY_ORDER[y.severity])
  const funnelOrder: InsightArea[] = ['saude', 'aquisicao', 'ativacao', 'conversao', 'retencao', 'engajamento', 'receita', 'satisfacao']
  const bottleneck = funnelOrder.map((area) => items.find((i) => i.area === area && i.severity === 'critico')).find(Boolean)
    || funnelOrder.map((area) => items.find((i) => i.area === area && i.severity === 'atencao')).find(Boolean)
    || null
  return { items, bottleneck }
}
