// Temas da sugestão de divulgação do dia, tirados do que a loja tem DE
// VERDADE: cupom ativo, avaliação de cliente, nota média, fidelidade,
// aniversário, frete grátis, combo, produto novo, marco de pedidos e o app
// da loja. Cada tema guarda só fatos reais; o texto nunca promete nada
// que não esteja aqui. Puro (testável); a rota busca os dados.
import { formatBRL } from './money'

export type TopicKind = 'produto' | 'cupom' | 'avaliacao' | 'nota' | 'fidelidade' | 'aniversario' | 'frete' | 'combo' | 'novidade' | 'marco' | 'app'

export const TOPIC_LABELS: Record<TopicKind, string> = {
  produto: 'Produto do dia',
  cupom: 'Cupom ativo',
  avaliacao: 'Avaliação de cliente',
  nota: 'Nota da loja',
  fidelidade: 'Programa de fidelidade',
  aniversario: 'Desconto de aniversário',
  frete: 'Entrega grátis',
  combo: 'Combo',
  novidade: 'Novidade no cardápio',
  marco: 'Marco de pedidos',
  app: 'App da loja',
}

export interface Topic {
  kind: TopicKind
  key: string            // evita repetir o mesmo cupom/avaliação em seguida
  weight: number
  facts: Record<string, string | number | null>
  productId?: string | null
  imageUrl?: string | null
}

export interface TopicData {
  coupons: { code: string; discount_type: string; discount_value: number; expires_at: string | null; max_uses: number | null; used_count: number | null }[]
  reviews: { id: string; customer_name: string | null; customer_rating: number; customer_review: string | null; created_at: string }[]
  ratingAvg: number | null
  ratingCount: number
  loyalty: { active: boolean; pointsPerReal: number | null; rewards: { name: string; points_cost: number }[] }
  birthdayPercent: number | null
  freeShippingThreshold: number | null
  freeDelivery: boolean
  combos: { id: string; name: string; price: number; image_url: string | null; description: string | null }[]
  newProducts: { id: string; name: string; price: number; image_url: string | null; description: string | null }[]
  ordersTotal: number
  ordersTotal14dAgo: number
  appDevices: number
  hasProducts: boolean
}

const MILESTONES = [50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 7500, 10000]

/** Primeiro nome + inicial do sobrenome ("Mariana L."), nunca o nome completo. */
export function shortName(name: string | null | undefined): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'Cliente'
  const first = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase()
  return parts.length > 1 ? `${first} ${parts[parts.length - 1].charAt(0).toUpperCase()}.` : first
}

export function couponBenefit(c: { discount_type: string; discount_value: number }): string {
  if (c.discount_type === 'percent') return `${Number(c.discount_value).toLocaleString('pt-BR')}% de desconto`
  if (c.discount_type === 'fixed') return `${formatBRL(Number(c.discount_value))} de desconto`
  return 'entrega grátis'
}

export function buildTopics(d: TopicData, now = new Date()): Topic[] {
  const topics: Topic[] = []
  for (const c of d.coupons) {
    if (c.expires_at && new Date(c.expires_at) <= now) continue
    if (c.max_uses != null && (c.used_count || 0) >= c.max_uses) continue
    topics.push({
      kind: 'cupom', key: `cupom:${c.code}`, weight: 6,
      facts: { codigo: c.code, beneficio: couponBenefit(c), validade: c.expires_at ? new Date(c.expires_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : null },
    })
  }
  for (const r of d.reviews) {
    const text = (r.customer_review || '').trim()
    if (r.customer_rating < 4 || text.length < 12) continue
    topics.push({ kind: 'avaliacao', key: `avaliacao:${r.id}`, weight: r.customer_rating === 5 ? 5 : 3, facts: { cliente: shortName(r.customer_name), nota: r.customer_rating, texto: text.slice(0, 220) } })
  }
  if (d.ratingCount >= 10 && d.ratingAvg != null && d.ratingAvg >= 4.5) {
    topics.push({ kind: 'nota', key: 'nota', weight: 2.5, facts: { media: Math.round(d.ratingAvg * 10) / 10, avaliacoes: d.ratingCount } })
  }
  if (d.loyalty.active && d.loyalty.rewards.length) {
    const r = [...d.loyalty.rewards].sort((a, b) => a.points_cost - b.points_cost)
    topics.push({ kind: 'fidelidade', key: 'fidelidade', weight: 3, facts: { pontos_por_real: d.loyalty.pointsPerReal, recompensa: r[0].name, pontos: r[0].points_cost, outras: r.slice(1, 3).map((x) => x.name).join(', ') || null } })
  }
  if (d.birthdayPercent && d.birthdayPercent > 0) {
    topics.push({ kind: 'aniversario', key: 'aniversario', weight: 1.5, facts: { desconto: d.birthdayPercent } })
  }
  if (d.freeDelivery) topics.push({ kind: 'frete', key: 'frete', weight: 2, facts: { minimo: null } })
  else if (d.freeShippingThreshold && d.freeShippingThreshold > 0) topics.push({ kind: 'frete', key: 'frete', weight: 2.5, facts: { minimo: formatBRL(d.freeShippingThreshold) } })
  for (const c of d.combos) {
    topics.push({ kind: 'combo', key: `combo:${c.id}`, weight: c.image_url ? 3.5 : 2, imageUrl: c.image_url, facts: { nome: c.name, preco: formatBRL(Number(c.price)), descricao: c.description || null } })
  }
  for (const p of d.newProducts) {
    topics.push({ kind: 'novidade', key: `novidade:${p.id}`, weight: p.image_url ? 5 : 3, productId: p.id, imageUrl: p.image_url, facts: { nome: p.name, preco: formatBRL(Number(p.price)), descricao: p.description || null } })
  }
  const reached = MILESTONES.filter((m) => d.ordersTotal >= m && d.ordersTotal14dAgo < m).pop()
  if (reached) topics.push({ kind: 'marco', key: `marco:${reached}`, weight: 7, facts: { pedidos: reached } })
  if (d.hasProducts) topics.push({ kind: 'app', key: 'app', weight: d.appDevices < 20 ? 1.5 : 0.8, facts: { aparelhos: d.appDevices } })
  if (d.hasProducts) topics.push({ kind: 'produto', key: 'produto', weight: 4, facts: {} })
  return topics
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/**
 * Tema do dia: sorteio com peso, estável no dia (mesma variação = mesmo
 * tema), evitando o tipo das últimas 2 sugestões e o mesmo cupom/
 * avaliação/combo das últimas 14.
 */
export function pickTopic(topics: Topic[], recent: { topic: string | null; topic_key: string | null }[], seedKey: string): Topic | null {
  if (!topics.length) return null
  const lastKinds = new Set(recent.slice(0, 2).map((r) => r.topic || 'produto'))
  const usedKeys = new Set(recent.slice(0, 14).map((r) => r.topic_key).filter(Boolean))
  let pool = topics.filter((t) => !lastKinds.has(t.kind) && (t.kind === 'produto' || !usedKeys.has(t.key)))
  if (!pool.length) pool = topics.filter((t) => t.kind === 'produto' || !usedKeys.has(t.key))
  if (!pool.length) pool = topics
  const total = pool.reduce((a, t) => a + t.weight, 0)
  let roll = (hash(seedKey) % 10_000) / 10_000 * total
  for (const t of pool) {
    roll -= t.weight
    if (roll < 0) return t
  }
  return pool[pool.length - 1]
}

export interface TopicText {
  headline: string
  subline: string
  highlight: string | null
  caption: string
  hashtags: string[]
  push_title: string
  push_body: string
}

const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…')
const tag = (s: string) => '#' + s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
const CTA = '📲 Peça pelo link na bio.'

/** Gerador próprio por tema (sem custo, sem chave). Só usa os fatos do tema. */
export function freeTopicText(topic: Topic, storeName: string): TopicText {
  const f = topic.facts
  const base = [tag(storeName), '#pedidoonline', '#delivery']
  const out = (o: Omit<TopicText, 'hashtags'> & { tags?: string[] }): TopicText => ({
    headline: clip(o.headline, 48), subline: clip(o.subline, 90), highlight: o.highlight, caption: o.caption,
    push_title: clip(o.push_title, 60), push_body: clip(o.push_body, 160),
    hashtags: Array.from(new Set([...base, ...(o.tags || [])])).filter((t) => t.length > 2).slice(0, 8),
  })
  switch (topic.kind) {
    case 'cupom':
      return out({
        headline: `Cupom ${f.codigo}`,
        subline: `Ganhe ${f.beneficio} no seu pedido${f.validade ? ` até ${f.validade}` : ''}`,
        highlight: String(f.codigo),
        caption: [`Tem cupom na ${storeName}! 🎉`, '', `Use ${f.codigo} e ganhe ${f.beneficio} pedindo pelo nosso cardápio online.${f.validade ? ` Válido até ${f.validade}.` : ''}`, '', CTA].join('\n'),
        push_title: `Cupom ${f.codigo}: ${f.beneficio}`,
        push_body: `Use ${f.codigo} no seu pedido de hoje. Toque para pedir.`,
        tags: ['#cupom', '#desconto'],
      })
    case 'avaliacao': {
      const stars = '★'.repeat(Number(f.nota) || 5)
      return out({
        headline: 'Quem pediu, aprovou',
        subline: `“${clip(String(f.texto), 70)}” ${f.cliente}`,
        highlight: stars,
        caption: [`${stars}`, `“${f.texto}”`, `${f.cliente}, cliente da ${storeName}`, '', 'Obrigado pelo carinho! Avaliações assim fazem o nosso dia. ❤️', '', `${CTA} Depois conta pra gente o que achou.`].join('\n'),
        push_title: `${stars} Olha o que disseram da gente`,
        push_body: `“${clip(String(f.texto), 110)}” ${f.cliente}`,
        tags: ['#avaliacao', '#clientesatisfeito'],
      })
    }
    case 'nota':
      return out({
        headline: `Nota ${String(f.media).replace('.', ',')} de 5`,
        subline: `Em ${f.avaliacoes} avaliações de clientes`,
        highlight: `★ ${String(f.media).replace('.', ',')}`,
        caption: [`Nota ${String(f.media).replace('.', ',')} de 5 em ${f.avaliacoes} avaliações! ⭐`, '', `Obrigado a cada cliente que pediu e avaliou a ${storeName}.`, '', CTA].join('\n'),
        push_title: `Nota ${String(f.media).replace('.', ',')} de 5 ⭐`,
        push_body: `Obrigado pelas ${f.avaliacoes} avaliações! Toque para pedir de novo.`,
        tags: ['#avaliacao'],
      })
    case 'fidelidade':
      return out({
        headline: 'Pediu, ganhou pontos',
        subline: `Junte ${f.pontos} pontos e troque por ${f.recompensa}`,
        highlight: `${f.pontos} pts`,
        caption: [`Na ${storeName} cada pedido vale pontos! 🎁`, '', `${f.pontos_por_real ? `Você ganha ${String(f.pontos_por_real).replace('.', ',')} ponto(s) por real gasto. ` : ''}Com ${f.pontos} pontos você troca por ${f.recompensa}.${f.outras ? ` Tem também: ${f.outras}.` : ''}`, '', `${CTA} Seus pontos aparecem no próprio cardápio.`].join('\n'),
        push_title: 'Seus pedidos valem pontos 🎁',
        push_body: `Junte ${f.pontos} pontos e troque por ${f.recompensa}.`,
        tags: ['#fidelidade', '#pontos'],
      })
    case 'aniversario':
      return out({
        headline: 'Aniversariante ganha desconto',
        subline: `${f.desconto}% no dia do seu aniversário`,
        highlight: `${f.desconto}% OFF`,
        caption: [`Fazendo aniversário? 🎂`, '', `Na ${storeName}, aniversariante ganha ${f.desconto}% de desconto no dia. É só deixar sua data de nascimento salva no nosso cardápio online (vale para datas cadastradas com antecedência).`, '', CTA].join('\n'),
        push_title: 'Aniversário com desconto 🎂',
        push_body: `Salve sua data de nascimento no cardápio e ganhe ${f.desconto}% no seu dia.`,
        tags: ['#aniversario'],
      })
    case 'frete':
      return out({
        headline: f.minimo ? 'Entrega grátis' : 'A entrega é por nossa conta',
        subline: f.minimo ? `Em pedidos a partir de ${f.minimo}` : 'Peça sem taxa de entrega',
        highlight: 'Frete grátis',
        caption: [f.minimo ? `Entrega grátis nos pedidos a partir de ${f.minimo}! 🛵` : 'Aqui a entrega é grátis! 🛵', '', `Monte seu pedido no cardápio online da ${storeName}.`, '', CTA].join('\n'),
        push_title: 'Entrega grátis 🛵',
        push_body: f.minimo ? `Pedidos a partir de ${f.minimo} não pagam entrega.` : 'Peça sem pagar a entrega.',
        tags: ['#fretegratis', '#entregagratis'],
      })
    case 'combo':
      return out({
        headline: String(f.nome),
        subline: `Por ${f.preco}`,
        highlight: String(f.preco),
        caption: [`${f.nome} 😋`, '', f.descricao ? clip(String(f.descricao), 160) : 'Monte do seu jeito, direto no cardápio.', `Por ${f.preco}.`, '', CTA].join('\n'),
        push_title: `${clip(String(f.nome), 40)} por ${f.preco}`,
        push_body: 'Monte o seu combo em 1 minuto. Toque para pedir.',
        tags: ['#combo'],
      })
    case 'novidade':
      return out({
        headline: 'Novidade no cardápio!',
        subline: `${f.nome} · ${f.preco}`,
        highlight: 'NOVO',
        caption: ['Chegou novidade! ✨', '', `${f.nome}${f.descricao ? `: ${clip(String(f.descricao), 140)}` : ''}`, `Por ${f.preco}.`, '', `${CTA} Conta pra gente o que achou.`].join('\n'),
        push_title: 'Novidade no cardápio ✨',
        push_body: `${f.nome} por ${f.preco}. Toque para experimentar.`,
        tags: ['#novidade', '#lancamento'],
      })
    case 'marco':
      return out({
        headline: `${Number(f.pedidos).toLocaleString('pt-BR')} pedidos!`,
        subline: 'Obrigado a cada cliente que pediu com a gente',
        highlight: Number(f.pedidos).toLocaleString('pt-BR'),
        caption: [`Chegamos a ${Number(f.pedidos).toLocaleString('pt-BR')} pedidos pelo nosso cardápio online! 🎉`, '', `Muito obrigado a cada cliente da ${storeName}. Vocês são o motivo de tudo isso. ❤️`, '', CTA].join('\n'),
        push_title: `${Number(f.pedidos).toLocaleString('pt-BR')} pedidos! Obrigado ❤️`,
        push_body: 'Vocês fizeram isso acontecer. Toque para pedir de novo.',
        tags: ['#obrigado', '#gratidao'],
      })
    case 'app':
    default:
      return out({
        headline: 'Tenha a gente no celular',
        subline: 'Instale nosso app e acompanhe seu pedido em tempo real',
        highlight: null,
        caption: [`Agora a ${storeName} tem app! 📱`, '', 'Abra nosso cardápio e toque em instalar: o ícone fica na tela do celular, você acompanha cada etapa do pedido e recebe os avisos da loja.', '', CTA].join('\n'),
        push_title: 'Tenha a gente no celular 📱',
        push_body: 'Instale nosso app e acompanhe seu pedido em tempo real.',
        tags: ['#app'],
      })
  }
}
