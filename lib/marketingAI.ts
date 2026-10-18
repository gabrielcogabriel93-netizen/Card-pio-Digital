import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { formatBRL } from '@/lib/money'
import { logWarning } from '@/lib/logger'

// Sugestão de divulgação do dia: escolhe o produto da vez e escreve o
// post (legenda, hashtags, chamada da arte) e a notificação.
//
// Funciona sempre de graça com o gerador próprio (regras + modelos de
// texto). Com uma chave configurada na Vercel, o texto fica por conta de
// uma IA: ANTHROPIC_API_KEY (Claude, pago por uso) ou GEMINI_API_KEY
// (Google, tem cota gratuita). Qualquer falha da IA cai no gerador próprio.

export interface SuggestionProduct {
  id: string
  name: string
  description?: string | null
  price: number
  image_url?: string | null
  category?: string | null
  is_featured?: boolean | null
}

export interface SuggestionInput {
  storeName: string
  storeDescription?: string | null
  products: SuggestionProduct[]
  recentProductIds: string[]
  timeZone: string
  now?: Date
  variation?: number
}

export interface Suggestion {
  product_ids: string[]
  headline: string
  subline: string
  caption: string
  hashtags: string[]
  push_title: string
  push_body: string
  provider: 'claude' | 'gemini' | 'fregues'
}

const SuggestionSchema = z.object({
  product_id: z.string(),
  headline: z.string(),
  subline: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()),
  push_title: z.string(),
  push_body: z.string(),
})
type AiSuggestion = z.infer<typeof SuggestionSchema>

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

// Gancho por dia da semana (gerador próprio).
const HOOKS: Record<number, string[]> = {
  0: ['Domingo pede {p}', 'Domingão merece {p}', 'Fecha o fim de semana com {p}'],
  1: ['Segunda mais leve com {p}', 'Começa a semana com {p}', 'Segunda pede um carinho: {p}'],
  2: ['Terça com gostinho de {p}', 'Bateu vontade de {p}?', 'Terça boa é com {p}'],
  3: ['Meio da semana pede {p}', 'Quarta com {p}', 'Já pensou em {p} hoje?'],
  4: ['Quinta é quase sexta: {p}', 'Quinta com {p}', 'Esquenta pro fim de semana: {p}'],
  5: ['Sextou com {p}!', 'Sexta pede {p}', 'O fim de semana começa com {p}'],
  6: ['Sábado pede {p}', 'Sabadou com {p}', 'Sábado é dia de {p}'],
}
const CTAS = ['Peça pelo link na bio', 'Toque no link da bio e peça em 1 minuto', 'Peça agora pelo nosso cardápio online']
const EMOJIS = ['😋', '🔥', '🤤', '✨', '❤️', '👀']

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

function dayKey(now: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

function weekday(now: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(now)
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name)
}

const tag = (s: string) => '#' + s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…')
// Sem travessão no texto (fica com cara de texto de máquina).
const clean = (s: string) => s.replace(/\s*[—–]\s*/g, ', ').trim()

/** Produtos candidatos do dia: com foto, ativos, variando de um dia pro outro. */
export function pickCandidates(input: SuggestionInput, count = 3): SuggestionProduct[] {
  const key = dayKey(input.now || new Date(), input.timeZone) + ':' + (input.variation || 0)
  const recent = new Set(input.recentProductIds)
  return [...input.products]
    .map((p) => ({
      p,
      score: (p.image_url ? 2000 : 0) + (p.is_featured ? 250 : 0) - (recent.has(p.id) ? 1500 : 0) + (hash(key + p.id) % 1000),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((x) => x.p)
}

/** Gerador próprio: sempre funciona, sem custo e sem chave. */
export function freeSuggestion(input: SuggestionInput, product: SuggestionProduct): Suggestion {
  const now = input.now || new Date()
  const wd = weekday(now, input.timeZone)
  const seed = hash(dayKey(now, input.timeZone) + product.id + (input.variation || 0))
  const pick = <T,>(arr: T[], salt = 0) => arr[(seed + salt) % arr.length]
  const short = product.name.length > 22 ? product.name.split(/\s+/).slice(0, 3).join(' ') : product.name
  const hook = pick(HOOKS[wd] || HOOKS[1]).replace('{p}', short)
  const emoji = pick(EMOJIS, 3)
  const price = formatBRL(Number(product.price))
  const desc = product.description ? clip(clean(product.description), 140) : ''

  const caption = [
    `${hook} ${emoji}`,
    '',
    desc ? `${product.name}: ${desc}` : `${product.name} do jeitinho que você gosta.`,
    `Hoje por ${price}.`,
    '',
    `📲 ${pick(CTAS, 7)} e receba o status do pedido no celular.`,
  ].join('\n')

  const hashtags = Array.from(new Set([
    tag(input.storeName),
    product.category ? tag(product.category) : null,
    tag(short),
    '#delivery', '#pedidoonline', '#comidaboa', `#${WEEKDAYS[wd].split('-')[0]}`,
  ].filter((t): t is string => !!t && t.length > 2))).slice(0, 8)

  return {
    product_ids: [product.id],
    headline: clip(hook, 42),
    subline: `${clip(product.name, 40)} · ${price}`,
    caption,
    hashtags,
    push_title: clip(`${hook} ${emoji}`, 55),
    push_body: clip(`${product.name} por ${price}. Toque para pedir em 1 minuto.`, 150),
    provider: 'fregues',
  }
}

function prompt(input: SuggestionInput, candidates: SuggestionProduct[]) {
  const now = input.now || new Date()
  return [
    `Loja: ${input.storeName}${input.storeDescription ? ` (${clip(input.storeDescription, 200)})` : ''}.`,
    `Hoje é ${WEEKDAYS[weekday(now, input.timeZone)]}.`,
    'Produtos candidatos para o destaque de hoje (escolha UM pelo product_id):',
    JSON.stringify(candidates.map((p) => ({ product_id: p.id, nome: p.name, descricao: p.description || '', preco: formatBRL(Number(p.price)), categoria: p.category || '' }))),
    '',
    'Escreva em português do Brasil, tom próximo e apetitoso, sem exagero e sem inventar promoção, desconto ou ingrediente que não esteja nos dados. Não use travessão.',
    'headline: chamada curta para a arte (até 40 caracteres).',
    'subline: nome do produto e preço (até 60 caracteres).',
    'caption: legenda do Instagram com 3 a 6 linhas curtas, 1 ou 2 emojis, e termine convidando a pedir pelo link na bio.',
    'hashtags: de 5 a 8, cada uma começando com #, sem espaço.',
    'push_title: título da notificação no celular (até 50 caracteres).',
    'push_body: texto da notificação (até 140 caracteres), com o preço.',
  ].join('\n')
}

function finalize(ai: AiSuggestion, candidates: SuggestionProduct[], provider: Suggestion['provider']): Suggestion | null {
  const product = candidates.find((p) => p.id === ai.product_id) || candidates[0]
  if (!product || !ai.headline || !ai.caption || !ai.push_title || !ai.push_body) return null
  return {
    product_ids: [product.id],
    headline: clip(clean(ai.headline), 48),
    subline: clip(clean(ai.subline || `${product.name} · ${formatBRL(Number(product.price))}`), 80),
    caption: clip(clean(ai.caption), 1200),
    hashtags: ai.hashtags.map((h) => (h.startsWith('#') ? h : '#' + h).replace(/\s+/g, '')).filter((h) => h.length > 2).slice(0, 10),
    push_title: clip(clean(ai.push_title), 60),
    push_body: clip(clean(ai.push_body), 160),
    provider,
  }
}

async function withClaude(input: SuggestionInput, candidates: SuggestionProduct[]): Promise<Suggestion | null> {
  const client = new Anthropic({ timeout: 45_000, maxRetries: 1 })
  const response = await client.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 4000,
    system: 'Você é redator de marketing para pequenos restaurantes e lojas de comida no Brasil.',
    messages: [{ role: 'user', content: prompt(input, candidates) }],
    output_config: { effort: 'low', format: zodOutputFormat(SuggestionSchema) },
  })
  if (response.stop_reason === 'refusal' || !response.parsed_output) return null
  return finalize(response.parsed_output, candidates, 'claude')
}

async function withGemini(input: SuggestionInput, candidates: SuggestionProduct[]): Promise<Suggestion | null> {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY || '' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt(input, candidates) + '\n\nResponda só com um JSON com as chaves product_id, headline, subline, caption, hashtags (lista), push_title, push_body.' }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.9 },
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`Gemini respondeu ${res.status}`)
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || ''
  const parsed = SuggestionSchema.safeParse(JSON.parse(text))
  return parsed.success ? finalize(parsed.data, candidates, 'gemini') : null
}

export async function generateSuggestion(input: SuggestionInput): Promise<Suggestion | null> {
  const candidates = pickCandidates(input)
  if (candidates.length === 0) return null

  try {
    if (process.env.ANTHROPIC_API_KEY) {
      const s = await withClaude(input, candidates)
      if (s) return s
    } else if (process.env.GEMINI_API_KEY) {
      const s = await withGemini(input, candidates)
      if (s) return s
    }
  } catch (err) {
    logWarning('marketing:sugestao', 'IA indisponível, usando o gerador próprio', err)
  }
  return freeSuggestion(input, candidates[0])
}
