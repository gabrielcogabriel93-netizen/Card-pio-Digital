// Estrategista de promoções (painel → Sugestões de promoções). Olha todos
// os produtos, as vendas dos últimos 30 dias e a operação da loja, e monta
// ofertas que a loja consegue aplicar com um toque: preço "de/por", combo,
// cupom ou frete grátis acima de um valor. Cada sugestão traz a conta de
// por que ela dá lucro (margem, quanto precisa vender a mais, ticket).
// Puro e determinístico (a semana escolhe a ordem), para testar.
import { formatBRL } from './money'
import { endOfLocalDay, upcomingOccasions } from './promoCalendar'

export const ASSUMED_COST_RATE = 0.35 // custo típico de comida (ingredientes + embalagem)

export interface StrategyProduct {
  id: string
  name: string
  price: number
  cost_price?: number | null
  promo_price?: number | null
  category?: string | null
  image_url?: string | null
  has_options: boolean // produto com grupos de opções não entra em combo
  qty30: number
  revenue30: number
}

export interface StrategyInput {
  storeName: string
  products: StrategyProduct[]
  orders30: number
  avgTicket: number | null
  weekdayOrders: number[] // 7 posições, 0 = domingo
  deliveryFee: number
  freeShippingThreshold: number | null
  offersDelivery: boolean
  existingCouponCodes: string[]
  activeKeys: string[] // chaves de promoções já ativas (não repete)
  weekKey: string
  today?: string // AAAA-MM-DD no fuso da loja (liga as datas comemorativas)
  timezone?: string
}

export type PromoKind = 'preco' | 'combo' | 'cupom' | 'frete'

export interface PromoSuggestion {
  key: string
  kind: PromoKind
  title: string
  summary: string
  why: string[]
  howToPromote: string
  durationDays: number
  apply:
    | { kind: 'preco'; product_id: string; promo_price: number; days: number }
    | { kind: 'combo'; name: string; price: number; description: string; product_ids: string[] }
    | { kind: 'cupom'; code: string; discount_type: 'percent' | 'fixed' | 'free_shipping'; discount_value: number; max_uses_per_customer: number | null; days: number; show_on_menu: boolean }
    | { kind: 'frete'; threshold: number }
  banner: { title: string; subtitle: string; link_type: 'produto' | 'combo' | 'cupom' | 'nenhum'; link_ref?: string | null }
  score: number
  endsAt?: string // termina num instante exato (fim do dia da data comemorativa)
  occasion?: { name: string; date: string; daysUntil: number }
}

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const brl = (n: number) => formatBRL(Math.round(n * 100) / 100)
const pct = (n: number) => `${Math.round(n * 100)}%`

/** Preço "quebrado" atrativo (final ,90) mais perto do alvo. */
export function charmPrice(target: number): number {
  const floor = Math.floor(target)
  const up = floor + 0.9
  const down = floor - 0.1
  const candidate = Math.abs(up - target) <= Math.abs(target - down) ? up : down
  return Math.round(Math.max(0.9, candidate) * 100) / 100
}

export function costOf(p: Pick<StrategyProduct, 'price' | 'cost_price'>): { cost: number; assumed: boolean } {
  if (p.cost_price != null && p.cost_price > 0) return { cost: Number(p.cost_price), assumed: false }
  return { cost: Number(p.price) * ASSUMED_COST_RATE, assumed: true }
}

/** Quanto a mais precisa vender para o lucro empatar com o desconto. */
export function breakEvenLift(price: number, cost: number, newPrice: number): number | null {
  const before = price - cost
  const after = newPrice - cost
  if (after <= 0) return null
  return before / after - 1
}

const isAddOn = (p: StrategyProduct) => /bebida|refri|refrigerante|suco|água|agua|cerveja|sobremesa|doce|pudim|mousse|sorvete|açaí|acai/i.test(`${p.category || ''} ${p.name}`)

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

function uniqueCode(base: string, existing: string[]): string {
  const taken = new Set(existing.map((c) => c.toUpperCase()))
  if (!taken.has(base)) return base
  for (let i = 2; i < 100; i++) if (!taken.has(`${base}${i}`)) return `${base}${i}`
  return `${base}${Date.now() % 1000}`
}

export function buildPromotions(input: StrategyInput): PromoSuggestion[] {
  const out: PromoSuggestion[] = []
  const products = input.products.filter((p) => p.price > 0)
  const hasSales = input.orders30 >= 5
  const costNote = (assumed: boolean) => (assumed ? ` (custo estimado em ${pct(ASSUMED_COST_RATE)} do preço; cadastre o custo do prato para a conta exata)` : '')
  const sorted = [...products].sort((a, b) => b.qty30 - a.qty30 || b.price - a.price)
  const best = sorted[0]

  // 1. Prato da semana: desconto num produto com boa margem que vende pouco.
  const candidates = products
    .filter((p) => !p.promo_price)
    .map((p) => ({ p, ...costOf(p) }))
    .filter(({ p, cost }) => (p.price - cost) / p.price >= 0.45)
    .sort((a, b) => a.p.qty30 - b.p.qty30 || b.p.price - a.p.price)
  for (const { p, cost, assumed } of candidates.slice(0, 4)) {
    const discount = p.qty30 === 0 ? 0.15 : 0.1
    const promo = charmPrice(p.price * (1 - discount))
    if (promo >= p.price || promo - cost <= 0) continue
    const lift = breakEvenLift(p.price, cost, promo)
    if (lift == null) continue
    out.push({
      key: `preco:${p.id}`,
      kind: 'preco',
      title: `Prato da semana: ${p.name} por ${brl(promo)}`,
      summary: `De ${brl(p.price)} por ${brl(promo)} durante 7 dias, com destaque no topo do cardápio.`,
      why: [
        `Margem por unidade: ${brl(p.price - cost)} hoje e ${brl(promo - cost)} na oferta${costNote(assumed)}.`,
        `Para o lucro empatar, basta vender ${pct(lift)} a mais desse prato na semana; daí para cima é lucro extra.`,
        p.qty30 === 0
          ? (input.orders30 === 0 ? 'Com a oferta e o banner, o prato ganha destaque logo na abertura do cardápio.' : 'Ele não vendeu nos últimos 30 dias: a oferta coloca o prato na vitrine e mostra que ele existe.')
          : `Vendeu ${p.qty30} nos últimos 30 dias, bem menos que os campeões: tem espaço para crescer.`,
        'Quem vem pela oferta costuma levar bebida ou outro item, o que aumenta o ticket.',
      ],
      howToPromote: 'Poste a foto do prato com o preço "de/por" no status do WhatsApp e no Instagram, e mande uma notificação para os clientes.',
      durationDays: 7,
      apply: { kind: 'preco', product_id: p.id, promo_price: promo, days: 7 },
      banner: { title: `${p.name} por ${brl(promo)}`, subtitle: `Prato da semana · de ${brl(p.price)}`, link_type: 'produto', link_ref: p.id },
      score: 60 + (p.qty30 === 0 ? 10 : 0),
    })
  }

  // 2. Combo: campeão de vendas + bebida/sobremesa (itens sem opções).
  const comboMains = sorted.filter((p) => !p.has_options && !isAddOn(p))
  const addOns = products.filter((p) => !p.has_options && isAddOn(p)).sort((a, b) => a.price - b.price)
  if (comboMains[0] && addOns[0]) {
    const main = comboMains[0]
    const add = addOns[0]
    const full = main.price + add.price
    const price = charmPrice(full * 0.9)
    const c1 = costOf(main)
    const c2 = costOf(add)
    const marginCombo = price - c1.cost - c2.cost
    const marginMain = main.price - c1.cost
    if (price < full && marginCombo > marginMain) {
      out.push({
        key: `combo:${main.id}:${add.id}`,
        kind: 'combo',
        title: `Combo ${main.name} + ${add.name} por ${brl(price)}`,
        summary: `Os dois juntos por ${brl(price)} (separados dão ${brl(full)}).`,
        why: [
          `O cliente economiza ${brl(full - price)} e você vende dois itens no lugar de um.`,
          `Lucro do combo: ${brl(marginCombo)}, contra ${brl(marginMain)} vendendo só ${main.name}${costNote(c1.assumed || c2.assumed)}.`,
          `Cada combo vendido no lugar do prato sozinho traz ${brl(marginCombo - marginMain)} a mais de lucro e aumenta o ticket médio.`,
        ],
        howToPromote: 'Divulgue como "combo do dia" no status do WhatsApp e deixe o banner rodando no cardápio.',
        durationDays: 14,
        apply: { kind: 'combo', name: `Combo ${main.name} + ${add.name}`, price, description: `${main.name} + ${add.name}`, product_ids: [main.id, add.id] },
        banner: { title: `Combo por ${brl(price)}`, subtitle: `${main.name} + ${add.name}`, link_type: 'combo' },
        score: 70,
      })
    }
  }

  // 3. Frete grátis acima de um valor (sobe o ticket).
  if (input.offersDelivery && input.deliveryFee > 0 && !input.freeShippingThreshold) {
    const avg = input.avgTicket || (best ? best.price * 1.3 : 30)
    const marginRate = 1 - ASSUMED_COST_RATE
    const threshold = Math.ceil((avg + (1.2 * input.deliveryFee) / marginRate) / 5) * 5
    const extraSale = threshold - avg
    out.push({
      key: `frete:${threshold}`,
      kind: 'frete',
      title: `Entrega grátis acima de ${brl(threshold)}`,
      summary: `Pedidos de ${brl(threshold)} ou mais não pagam a entrega de ${brl(input.deliveryFee)}. O carrinho mostra "faltam R$ X para entrega grátis".`,
      why: [
        `${input.avgTicket ? `Seu ticket médio é ${brl(input.avgTicket)}` : 'Sem histórico ainda: estimei o ticket pelos seus preços'}. Quem está perto de ${brl(threshold)} adiciona um item para ganhar o frete.`,
        `Cada pedido que sobe até ${brl(threshold)} traz cerca de ${brl(extraSale)} a mais em vendas (≈ ${brl(extraSale * marginRate)} de lucro) e você abre mão de ${brl(input.deliveryFee)} de entrega.`,
        'O limite foi calculado para o lucro extra cobrir a entrega com folga.',
      ],
      howToPromote: 'Fixe no Instagram e no status: "Entrega grátis a partir de R$ X". A barra do carrinho faz o resto.',
      durationDays: 30,
      apply: { kind: 'frete', threshold },
      banner: { title: `Entrega grátis acima de ${brl(threshold)}`, subtitle: 'Monte seu pedido e economize na entrega', link_type: 'nenhum' },
      score: 55,
    })
  }

  // 4. Cupom de primeira compra (10%, uma vez por cliente).
  {
    const code = uniqueCode('BEMVINDO10', input.existingCouponCodes)
    const ref = best || products[0]
    const { cost, assumed } = ref ? costOf(ref) : { cost: 0, assumed: true }
    const marginAfter = ref ? ref.price * 0.9 - cost : 0
    out.push({
      key: 'cupom:boas-vindas',
      kind: 'cupom',
      title: `Cupom de primeira compra: ${code} (10%)`,
      summary: '10% de desconto, uma vez por cliente, divulgado no banner do cardápio. Válido por 30 dias.',
      why: [
        'Quem ainda não pediu precisa de um empurrão para testar; depois da primeira vez, o app da loja e a fidelidade trazem o cliente de volta sem desconto.',
        ref ? `Num pedido de ${brl(ref.price)} você ainda fica com ≈ ${brl(marginAfter)} de lucro${costNote(assumed)}.` : 'O desconto é pequeno perto do valor de um cliente que volta toda semana.',
        'O limite de um uso por telefone evita que vire desconto permanente.',
      ],
      howToPromote: 'Use na bio do Instagram e em anúncios: "Primeira compra com 10% off: BEMVINDO10".',
      durationDays: 30,
      apply: { kind: 'cupom', code, discount_type: 'percent', discount_value: 10, max_uses_per_customer: 1, days: 30, show_on_menu: true },
      banner: { title: `Primeira compra? ${code}`, subtitle: '10% de desconto no seu primeiro pedido', link_type: 'cupom', link_ref: code },
      score: hasSales ? 40 : 65,
    })
  }

  // 5. Dia mais fraco da semana.
  if (hasSales && input.weekdayOrders.some((n) => n > 0)) {
    const counts = input.weekdayOrders
    const max = Math.max(...counts)
    const weak = counts.map((n, d) => ({ n, d })).filter((x) => x.n > 0 || max > 0).sort((a, b) => a.n - b.n)[0]
    if (weak && weak.n < max * 0.6) {
      const day = WEEKDAYS[weak.d]
      const code = uniqueCode(`${day.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().slice(0, 6)}10`, input.existingCouponCodes)
      out.push({
        key: `cupom:dia:${weak.d}`,
        kind: 'cupom',
        title: `${day[0].toUpperCase()}${day.slice(1)} turbinada: cupom ${code}`,
        summary: `10% de desconto divulgado para a ${day}, o dia com menos pedidos (${weak.n} contra ${max} no melhor dia, nos últimos 30 dias).`,
        why: [
          'A cozinha e o entregador já estão pagos nesse dia: cada pedido a mais aproveita uma estrutura parada.',
          'O desconto vai para pedidos que provavelmente não aconteceriam, sem mexer nos dias fortes.',
          'Válido por 7 dias e divulgado no banner; para focar só no dia, poste o cupom no próprio dia.',
        ],
        howToPromote: `Na ${day}, mande uma notificação para os clientes e poste no status: "Hoje tem 10% com ${code}".`,
        durationDays: 7,
        apply: { kind: 'cupom', code, discount_type: 'percent', discount_value: 10, max_uses_per_customer: 2, days: 7, show_on_menu: true },
        banner: { title: `Cupom ${code}: 10% off`, subtitle: `Especial de ${day}`, link_type: 'cupom', link_ref: code },
        score: 58,
      })
    }
  }

  // 6. Reativação: cupom para quem sumiu (enviado por notificação).
  if (hasSales) {
    const code = uniqueCode('VOLTA15', input.existingCouponCodes)
    out.push({
      key: 'cupom:volta',
      kind: 'cupom',
      title: `Cupom de saudade: ${code} (15%) para quem sumiu`,
      summary: '15% de desconto, uma vez por cliente, enviado por notificação só para quem não pede há algum tempo (não aparece no cardápio).',
      why: [
        'Trazer de volta um cliente que já conhece a loja custa bem menos que conquistar um novo.',
        'Como o cupom não fica público, quem já pede sempre continua pagando o preço normal.',
        'Um único pedido de volta já paga o desconto; os seguintes são lucro cheio.',
      ],
      howToPromote: 'Depois de aplicar, vá em Notificações → público "Sumidos" e envie a mensagem com o código.',
      durationDays: 15,
      apply: { kind: 'cupom', code, discount_type: 'percent', discount_value: 15, max_uses_per_customer: 1, days: 15, show_on_menu: false },
      banner: { title: '', subtitle: '', link_type: 'nenhum' },
      score: 50,
    })
  }

  if (input.today) out.push(...occasionPromotions(input, products, comboMains, addOns))

  const active = new Set(input.activeKeys)
  const ranked = out
    .filter((s) => !active.has(s.key))
    .map((s) => ({ s, order: s.score * 1000 + (hash(input.weekKey + s.key) % 1000) }))
    .sort((a, b) => b.order - a.order)
    .map((x) => x.s)
  // Variedade: primeiro a melhor de cada tipo, depois o resto na ordem.
  const firstOfKind = ranked.filter((s, i) => ranked.findIndex((x) => x.kind === s.kind) === i)
  return [...firstOfKind, ...ranked.filter((s) => !firstOfKind.includes(s))]
}

/** Semana atual (segunda a domingo) como chave estável. */
export function weekKeyOf(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day)
  return d.toISOString().slice(0, 10)
}

// 7. Datas comemorativas: aparecem dentro da janela de antecedência de cada
// data (Mães e Pais 3 semanas antes, Namorados 2 etc.) e valem até o fim do dia.
function occasionPromotions(input: StrategyInput, products: StrategyProduct[], comboMains: StrategyProduct[], addOns: StrategyProduct[]): PromoSuggestion[] {
  const out: PromoSuggestion[] = []
  const ticket = input.avgTicket || (products.length ? Math.max(...products.map((p) => p.price)) * 1.5 : 30)
  for (const o of upcomingOccasions(input.today!)) {
    if (o.needs && !products.some((p) => o.needs!.test(`${p.category || ''} ${p.name}`))) continue
    const key = `data:${o.id}:${o.date.slice(0, 4)}`
    const endsAt = endOfLocalDay(o.date, input.timezone)
    const durationDays = o.daysUntil + 1
    const day = `${o.date.slice(8, 10)}/${o.date.slice(5, 7)}`
    const when = o.daysUntil === 0 ? 'é hoje' : o.daysUntil === 1 ? 'é amanhã' : `faltam ${o.daysUntil} dias`
    const occasion = { name: o.name, date: o.date, daysUntil: o.daysUntil }
    const score = 80 + Math.max(0, 10 - o.daysUntil)
    const timing = `${o.name} (${day}) ${when}: a oferta entra agora e sai sozinha no fim do dia ${day}.`

    // Namorados: combo para dois quando há pratos sem opções e bebida.
    if (o.pairs && comboMains.length >= 2 && addOns[0]) {
      const items = [comboMains[0], comboMains[1], addOns[0]]
      const full = items.reduce((a, p) => a + p.price, 0)
      const price = charmPrice(full * 0.9)
      const costs = items.map(costOf)
      const margin = price - costs.reduce((a, c) => a + c.cost, 0)
      if (price < full && margin > 0) {
        out.push({
          key, kind: 'combo', occasion, endsAt, durationDays, score,
          title: `${o.theme}: combo para 2 por ${brl(price)}`,
          summary: `${items.map((p) => p.name).join(' + ')} por ${brl(price)} (separados dão ${brl(full)}), até o ${o.name}.`,
          why: [
            timing,
            o.angle,
            `Lucro do combo: ${brl(margin)}${costs.some((c) => c.assumed) ? ` (custo estimado em ${pct(ASSUMED_COST_RATE)} do preço)` : ''}; é um pedido de três itens no lugar de um.`,
          ],
          howToPromote: o.promote,
          apply: { kind: 'combo', name: `Combo ${o.theme}`, price, description: items.map((p) => p.name).join(' + '), product_ids: items.map((p) => p.id) },
          banner: { title: `${o.theme} · ${brl(price)}`, subtitle: `Combo para 2 · até ${day}`, link_type: 'combo' },
        })
        continue
      }
    }

    const disc = o.discount / 100
    const code = uniqueCode(`${o.code}${o.discount}`, input.existingCouponCodes)
    const left = ticket * (1 - disc - ASSUMED_COST_RATE)
    out.push({
      key, kind: 'cupom', occasion, endsAt, durationDays, score,
      title: `${o.name}: cupom ${code} (${o.discount}%)`,
      summary: `${o.discount}% de desconto divulgado no banner do cardápio até o fim do dia ${day}${o.discount >= 15 ? ', uma vez por cliente' : ', até 2 usos por cliente'}.`,
      why: [
        timing,
        o.angle,
        `Num pedido de ${brl(ticket)} o desconto é ${brl(ticket * disc)} e ainda sobram ≈ ${brl(left)} de margem (custo estimado em ${pct(ASSUMED_COST_RATE)}).`,
        'O cupom tem prazo: o cliente sente urgência e o desconto não vira permanente.',
      ],
      howToPromote: `${o.promote} Use o código ${code}.`,
      apply: { kind: 'cupom', code, discount_type: 'percent', discount_value: o.discount, max_uses_per_customer: o.discount >= 15 ? 1 : 2, days: durationDays, show_on_menu: true },
      banner: { title: `${o.theme}: ${o.discount}% off`, subtitle: `Cupom ${code} · até ${day}`, link_type: 'cupom', link_ref: code },
    })
  }
  return out
}
