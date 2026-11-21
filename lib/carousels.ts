// Carrosséis para o Instagram (Divulgar minha loja): monta o roteiro de cada
// carrossel com os dados reais da loja (mais pedidos, ofertas, combos,
// cupons divulgados, fidelidade e datas comemorativas), a legenda pronta e
// a sugestão de música. Puro, para testar; o desenho fica em carouselArt.ts.
import { formatBRL } from './money'

export type Slide =
  | { type: 'cover'; eyebrow: string; title: string; subtitle?: string; image?: string | null }
  | { type: 'product'; index?: string; name: string; price: string; oldPrice?: string | null; badge?: string | null; description?: string | null; image?: string | null }
  | { type: 'big'; eyebrow: string; big: string; title: string; subtitle?: string }
  | { type: 'list'; title: string; items: string[] }
  | { type: 'steps'; title: string; steps: string[] }
  | { type: 'cta'; title: string; subtitle: string }

export type CarouselKind = 'data' | 'ofertas' | 'cupom' | 'mais-pedidos' | 'fidelidade' | 'sem-taxa'

export interface CarouselPlan {
  key: string
  kind: CarouselKind
  title: string
  why: string
  slides: Slide[]
  caption: string
  music: { mood: string; search: string }
}

export interface CarouselProduct {
  id: string
  name: string
  price: number
  originalPrice?: number | null
  image?: string | null
  description?: string | null
  qty30: number
  featured?: boolean
}

export interface CarouselInput {
  storeName: string
  offersDelivery: boolean
  offersPickup: boolean
  freeShippingThreshold?: number | null
  products: CarouselProduct[]
  combos: { name: string; price: number; description?: string | null; image?: string | null }[]
  coupons: { code: string; discount_type: 'percent' | 'fixed' | 'free_shipping'; discount_value: number; expires_at?: string | null; max_uses_per_customer?: number | null }[]
  loyalty: { pointsPerReal: number; rewards: { name: string; points: number }[] } | null
  occasion?: { name: string; date: string; daysUntil: number } | null
  timeZone?: string
}

const brl = (n: number) => formatBRL(Math.round(n * 100) / 100)
const CTA_LINE = '📲 Peça pelo link na bio: cardápio completo, sem taxa de aplicativo.'

export function couponBenefitText(c: CarouselInput['coupons'][number]): string {
  if (c.discount_type === 'percent') return `${Number(c.discount_value)}% de desconto`
  if (c.discount_type === 'fixed') return `${brl(Number(c.discount_value))} de desconto`
  return 'Entrega grátis'
}

function dateBR(iso: string, timeZone = 'America/Sao_Paulo') {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone })
}

export function hashtagOf(name: string): string {
  const tag = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '')
  return tag ? `#${tag.toLowerCase()}` : ''
}

function caption(lines: (string | false | null | undefined)[], tags: string[], storeName: string): string {
  const hashtags = [hashtagOf(storeName), ...tags].filter(Boolean).slice(0, 5).join(' ')
  return [...lines.filter(Boolean), '', CTA_LINE, '', hashtags].join('\n')
}

const cta = (storeName: string): Slide => ({ type: 'cta', title: 'Peça agora pelo nosso cardápio', subtitle: 'Toque no link da bio ou aponte a câmera para o QR Code' })

export function buildCarousels(input: CarouselInput): CarouselPlan[] {
  const out: CarouselPlan[] = []
  const store = input.storeName
  const products = input.products.filter((p) => p.price > 0)
  const ranked = [...products].sort((a, b) => b.qty30 - a.qty30 || Number(!!b.featured) - Number(!!a.featured) || b.price - a.price)
  const publicCoupons = input.coupons.filter((c) => !c.expires_at || new Date(c.expires_at) > new Date())
  const offers = products.filter((p) => p.originalPrice && p.originalPrice > p.price)
  const firstCoupon = publicCoupons[0]

  // Data comemorativa chegando.
  if (input.occasion) {
    const o = input.occasion
    const day = `${o.date.slice(8, 10)}/${o.date.slice(5, 7)}`
    const highlight = (offers.length ? offers : ranked).slice(0, 2)
    const slides: Slide[] = [
      { type: 'cover', eyebrow: o.daysUntil === 0 ? 'É hoje' : `Faltam ${o.daysUntil} dia${o.daysUntil === 1 ? '' : 's'}`, title: `${o.name} chegando!`, subtitle: `Dia ${day}. Peça com antecedência e garanta o seu.`, image: highlight[0]?.image },
      ...highlight.map((p): Slide => ({ type: 'product', name: p.name, price: brl(p.price), oldPrice: p.originalPrice ? brl(p.originalPrice) : null, image: p.image, description: p.description })),
    ]
    if (firstCoupon) slides.push({ type: 'big', eyebrow: `Cupom de ${o.name}`, big: firstCoupon.code, title: couponBenefitText(firstCoupon), subtitle: 'Digite no carrinho ao fazer o pedido' })
    slides.push(cta(store))
    out.push({
      key: `data:${o.name}`, kind: 'data', title: `${o.name} (${day})`, why: `Datas comemorativas aumentam a procura: poste com antecedência para receber encomendas.`, slides,
      caption: caption([`${o.name} chegando! 🎉`, `Dia ${day} estamos prontos para deixar a data ainda mais gostosa.`, firstCoupon && `🎟️ Use o cupom ${firstCoupon.code} e ganhe ${couponBenefitText(firstCoupon).toLowerCase()}.`, 'Faça seu pedido com antecedência e garanta o seu.'], ['#delivery', '#datacomemorativa', '#pedidoonline'], store),
      music: { mood: 'Alegre e de celebração', search: `${o.name.toLowerCase()} ou "em alta"` },
    })
  }

  // Ofertas e combos.
  if (offers.length || input.combos.length) {
    const items: Slide[] = [
      ...offers.slice(0, 4).map((p): Slide => ({ type: 'product', name: p.name, price: brl(p.price), oldPrice: brl(p.originalPrice!), badge: `-${Math.round((1 - p.price / p.originalPrice!) * 100)}%`, image: p.image, description: p.description })),
      ...input.combos.slice(0, Math.max(0, 5 - Math.min(4, offers.length))).map((c): Slide => ({ type: 'product', name: c.name, price: brl(c.price), badge: 'COMBO', image: c.image, description: c.description })),
    ].slice(0, 5)
    out.push({
      key: 'ofertas', kind: 'ofertas', title: 'Ofertas e combos da semana', why: 'Preço "de/por" e combos são o que mais faz o cliente parar de rolar a tela.',
      slides: [{ type: 'cover', eyebrow: 'Por tempo limitado', title: 'Ofertas da semana', subtitle: 'Arraste para o lado e escolha a sua 👉', image: (offers[0] || input.combos[0])?.image }, ...items, cta(store)],
      caption: caption(['🔥 Ofertas da semana!', ...offers.slice(0, 3).map((p) => `✅ ${p.name}: de ${brl(p.originalPrice!)} por ${brl(p.price)}`), ...input.combos.slice(0, 2).map((c) => `🍽️ ${c.name} por ${brl(c.price)}`), 'Corre que é por tempo limitado!'], ['#promocao', '#oferta', '#delivery', '#combo'], store),
      music: { mood: 'Animada, ritmo de promoção', search: '"em alta" ou funk/pagode animado' },
    })
  }

  // Cupons divulgados.
  if (publicCoupons.length) {
    const slides: Slide[] = [
      { type: 'cover', eyebrow: 'Presente pra você', title: 'Tem cupom de desconto aqui 🎟️', subtitle: 'Arraste para pegar o seu 👉', image: ranked[0]?.image },
      ...publicCoupons.slice(0, 3).map((c): Slide => ({
        type: 'big', eyebrow: 'Cupom', big: c.code, title: couponBenefitText(c),
        subtitle: [c.expires_at ? `Válido até ${dateBR(c.expires_at, input.timeZone)}` : null, c.max_uses_per_customer === 1 ? '1 uso por cliente' : null].filter(Boolean).join(' · ') || 'Digite no carrinho ao pedir',
      })),
      { type: 'steps', title: 'Como usar', steps: ['Abra o cardápio pelo link da bio', 'Escolha seus itens', `No carrinho, digite o cupom ${publicCoupons[0].code}`] },
      cta(store),
    ]
    out.push({
      key: 'cupom', kind: 'cupom', title: `Cupom ${publicCoupons[0].code}`, why: 'Cupom com prazo cria urgência e é muito compartilhado.', slides,
      caption: caption(['🎟️ Cupom de desconto liberado!', ...publicCoupons.slice(0, 3).map((c) => `Use ${c.code} e ganhe ${couponBenefitText(c).toLowerCase()}${c.expires_at ? ` (até ${dateBR(c.expires_at, input.timeZone)})` : ''}.`), 'Salve este post e marque quem precisa ver 👇'], ['#cupomdedesconto', '#desconto', '#delivery'], store),
      music: { mood: 'Animada e divertida', search: '"em alta"' },
    })
  }

  // Mais pedidos.
  if (ranked.length >= 2) {
    const top = ranked.slice(0, Math.min(4, ranked.length))
    const sold = top.some((p) => p.qty30 > 0)
    out.push({
      key: 'mais-pedidos', kind: 'mais-pedidos', title: sold ? `Os ${top.length} mais pedidos` : `${top.length} destaques do cardápio`, why: 'Prova social: mostrar o que os clientes mais pedem ajuda quem ainda está em dúvida.',
      slides: [
        { type: 'cover', eyebrow: sold ? 'Ranking da semana' : 'Destaques da casa', title: sold ? `Os ${top.length} mais pedidos da casa` : 'Conheça os destaques da casa', subtitle: 'Qual é o seu favorito? 👉', image: top[0].image },
        ...top.map((p, i): Slide => ({ type: 'product', index: `#${i + 1}`, name: p.name, price: brl(p.price), oldPrice: p.originalPrice ? brl(p.originalPrice) : null, image: p.image, description: p.description })),
        cta(store),
      ],
      caption: caption([sold ? `🏆 Os ${top.length} mais pedidos da casa:` : '⭐ Destaques da casa:', ...top.map((p, i) => `${i + 1}. ${p.name} (${brl(p.price)})`), 'Comenta aqui qual é o seu favorito! 👇'], ['#delivery', '#maispedidos', '#comidaboa'], store),
      music: { mood: 'Batida de ranking / contagem', search: '"em alta" ou trend de "top"' },
    })
  }

  // Fidelidade.
  if (input.loyalty && input.loyalty.rewards.length) {
    const l = input.loyalty
    out.push({
      key: 'fidelidade', kind: 'fidelidade', title: 'Programa de fidelidade', why: 'Mostra que pedir direto compensa e traz o cliente de volta.',
      slides: [
        { type: 'cover', eyebrow: 'Programa de pontos', title: 'Aqui o seu pedido vale pontos', subtitle: 'E os pontos viram prêmio 🎁', image: ranked[0]?.image },
        { type: 'big', eyebrow: 'Como ganhar', big: `${l.pointsPerReal}`, title: `ponto${l.pointsPerReal === 1 ? '' : 's'} a cada R$ 1 em compras`, subtitle: 'Pedindo pelo nosso cardápio online' },
        { type: 'list', title: 'Troque por', items: l.rewards.slice(0, 4).map((r) => `${r.points} pontos → ${r.name}`) },
        { type: 'steps', title: 'É fácil', steps: ['Peça pelo link da bio', 'Informe seu telefone no pedido', 'Os pontos caem sozinhos e você troca no carrinho'] },
        cta(store),
      ],
      caption: caption(['🎁 Aqui seu pedido vale pontos!', `A cada R$ 1 você ganha ${l.pointsPerReal} ponto${l.pointsPerReal === 1 ? '' : 's'}.`, ...l.rewards.slice(0, 3).map((r) => `⭐ ${r.points} pontos = ${r.name}`), 'Os pontos só valem pedindo pelo nosso cardápio online.'], ['#fidelidade', '#clientefiel', '#delivery'], store),
      music: { mood: 'Leve e alegre', search: '"em alta" ou acústico alegre' },
    })
  }

  // Sempre: pedir direto, sem taxa.
  const ways = [input.offersDelivery && 'Entrega na sua casa', input.offersPickup && 'Retirada no balcão'].filter(Boolean) as string[]
  out.push({
    key: 'sem-taxa', kind: 'sem-taxa', title: 'Peça direto, sem taxa de app', why: 'Leva o cliente dos aplicativos de entrega para o seu canal próprio.',
    slides: [
      { type: 'cover', eyebrow: 'Novidade', title: 'Agora você pede direto com a gente', subtitle: 'Sem taxa de aplicativo 🙌', image: ranked[0]?.image },
      { type: 'list', title: 'Por que pedir pelo nosso cardápio', items: [...ways, 'Escolha como pagar na hora do pedido', 'Acompanhe o pedido em tempo real', input.freeShippingThreshold ? `Entrega grátis acima de ${brl(input.freeShippingThreshold)}` : 'Instale o app da loja no celular'].slice(0, 5) },
      { type: 'steps', title: 'Como pedir', steps: ['Toque no link da bio', 'Escolha seus itens', 'Confirme em poucos toques, sem cadastro'] },
      cta(store),
    ],
    caption: caption(['📣 Agora você pede direto com a gente!', 'Cardápio completo no celular, sem taxa de aplicativo e sem cadastro.', ways.length ? `${ways.map((w, i) => (i ? w.charAt(0).toLowerCase() + w.slice(1) : w)).join(' ou ')}.` : null, input.freeShippingThreshold ? `🛵 Entrega grátis acima de ${brl(input.freeShippingThreshold)}.` : null], ['#delivery', '#pedidoonline', '#cardapiodigital'], store),
    music: { mood: 'Animada e moderna', search: '"em alta"' },
  })

  return out
}
