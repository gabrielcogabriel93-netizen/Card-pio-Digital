// Calendário comercial brasileiro para as Sugestões de promoções. As datas
// móveis (Mães, Pais, Páscoa, Carnaval, Black Friday) são calculadas por ano.
// Cada data tem uma "antecedência": a sugestão aparece dentro dessa janela,
// para dar tempo de divulgar e receber encomendas.

export interface Occasion {
  id: string
  name: string
  date: string // AAAA-MM-DD
  lead: number // dias antes em que a sugestão começa a aparecer
  code: string // base do código do cupom
  discount: number // % do cupom
  theme: string // gancho do banner
  angle: string // por que vende nessa data
  promote: string // como divulgar
  needs?: RegExp // só para lojas com produtos assim (Dia da Pizza etc.)
  pairs?: boolean // data de casal: combo para 2 quando der
}

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

/** n-ésimo dia da semana do mês (weekday 0 = domingo; month 1-12). */
export function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7
  return ymd(year, month, day)
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function easterDate(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return ymd(year, month, day)
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  const t = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((t(to) - t(from)) / 86400000)
}

export function occasionsOf(year: number): Occasion[] {
  const easter = easterDate(year)
  const thanksgiving = nthWeekday(year, 11, 4, 4)
  return [
    { id: 'carnaval', name: 'Carnaval', date: addDays(easter, -47), lead: 10, code: 'FOLIA', discount: 10, theme: 'Carnaval sem fogão',
      angle: 'No Carnaval muita gente fica em casa ou volta do bloco sem vontade de cozinhar: é dia de pedir comida.',
      promote: 'Poste no status e no Instagram dias antes: "Feriado de Carnaval? A comida a gente leva."' },
    { id: 'mulheres', name: 'Dia da Mulher', date: ymd(year, 3, 8), lead: 7, code: 'ELAS', discount: 10, theme: 'Dia da Mulher',
      angle: 'É uma data de homenagem: cupom e mensagem carinhosa geram compartilhamento.',
      promote: 'Poste no dia 8 uma homenagem com o cupom e mande notificação aos clientes.' },
    { id: 'consumidor', name: 'Dia do Consumidor', date: ymd(year, 3, 15), lead: 7, code: 'CONSUMIDOR', discount: 10, theme: 'Semana do Consumidor',
      angle: 'O varejo todo faz ofertas nessa semana e o cliente está procurando desconto.',
      promote: 'Divulgue como "Semana do Consumidor" no status e no Instagram.' },
    { id: 'pascoa', name: 'Páscoa', date: easter, lead: 14, code: 'PASCOA', discount: 10, theme: 'Almoço de Páscoa',
      angle: 'A Páscoa junta a família no almoço de domingo: pedidos maiores e encomendas antecipadas.',
      promote: 'Abra as encomendas para o domingo de Páscoa com antecedência e poste o cardápio da data.' },
    { id: 'maes', name: 'Dia das Mães', date: nthWeekday(year, 5, 0, 2), lead: 21, code: 'MAES', discount: 10, theme: 'Dia das Mães',
      angle: 'É um dos domingos mais fortes do ano para restaurante: a família quer dar um dia de folga para a mãe, sem fogão.',
      promote: 'Divulgue "Neste domingo a mãe não cozinha" e aceite encomendas na semana para organizar a cozinha.' },
    { id: 'hamburguer', name: 'Dia do Hambúrguer', date: ymd(year, 5, 28), lead: 7, code: 'BURGER', discount: 10, theme: 'Dia do Hambúrguer',
      angle: 'Data famosa nas redes: quem vende hambúrguer ganha alcance de graça no dia.', promote: 'Poste no dia 28 com a foto do seu campeão.',
      needs: /hamb[uú]rguer|burger|lanche/i },
    { id: 'namorados', name: 'Dia dos Namorados', date: ymd(year, 6, 12), lead: 14, code: 'NAMORADOS', discount: 10, theme: 'Jantar a dois',
      angle: 'Muitos casais preferem jantar em casa: o pedido é para dois e costuma levar bebida e sobremesa.',
      promote: 'Poste "Jantar dos namorados em casa" e aceite pedidos agendados para a noite do dia 12.', pairs: true },
    { id: 'junina', name: 'Festa Junina', date: ymd(year, 6, 24), lead: 14, code: 'ARRAIA', discount: 10, theme: 'Arraiá',
      angle: 'Junho todo tem clima de festa: tema junino deixa a divulgação mais leve e chamativa.',
      promote: 'Use o tema junino nas postagens do mês e destaque o cupom no status.' },
    { id: 'pizza', name: 'Dia da Pizza', date: ymd(year, 7, 10), lead: 7, code: 'PIZZA', discount: 10, theme: 'Dia da Pizza',
      angle: 'Data famosa nas redes: quem vende pizza ganha alcance de graça no dia.', promote: 'Poste no dia 10 com a pizza mais pedida.',
      needs: /pizza/i },
    { id: 'pais', name: 'Dia dos Pais', date: nthWeekday(year, 8, 0, 2), lead: 21, code: 'PAIS', discount: 10, theme: 'Dia dos Pais',
      angle: 'Domingo de almoço em família: pedidos maiores, para várias pessoas.',
      promote: 'Divulgue "Almoço do Dia dos Pais" e aceite encomendas na semana.' },
    { id: 'cliente', name: 'Dia do Cliente', date: ymd(year, 9, 15), lead: 7, code: 'CLIENTE', discount: 15, theme: 'Dia do Cliente',
      angle: 'É a data certa para agradecer quem já compra e trazer de volta quem sumiu.',
      promote: 'Mande notificação para todos os clientes: "Hoje é seu dia, obrigado pela preferência".' },
    { id: 'criancas', name: 'Dia das Crianças', date: ymd(year, 10, 12), lead: 10, code: 'CRIANCAS', discount: 10, theme: 'Dia das Crianças',
      angle: 'Feriado com a família em casa: quem escolhe o almoço são as crianças.',
      promote: 'Poste no feriado com os pratos que as crianças mais gostam.' },
    { id: 'blackfriday', name: 'Black Friday', date: addDays(thanksgiving, 1), lead: 21, code: 'BLACK', discount: 15, theme: 'Black Friday',
      angle: 'O cliente passa a semana procurando desconto: quem não entra na Black Friday perde o pedido para quem entra.',
      promote: 'Anuncie a semana inteira como "Black Friday" e reforce no próprio dia com notificação.' },
    { id: 'natal', name: 'Natal', date: ymd(year, 12, 25), lead: 21, code: 'NATAL', discount: 10, theme: 'Natal',
      angle: 'Fim de ano tem confraternização e encomenda: quem divulga cedo enche a agenda.',
      promote: 'Abra as encomendas de fim de ano já e fixe o banner no cardápio.' },
    { id: 'reveillon', name: 'Réveillon', date: ymd(year, 12, 31), lead: 10, code: 'ANONOVO', discount: 10, theme: 'Réveillon',
      angle: 'Na virada ninguém quer passar o dia na cozinha: encomendas para a ceia e o almoço do dia 1º.',
      promote: 'Divulgue as encomendas de Réveillon junto com o Natal.' },
  ]
}

/** Datas dentro da janela de antecedência a partir de hoje (inclusive o próprio dia). */
export function upcomingOccasions(today: string): (Occasion & { daysUntil: number })[] {
  const year = Number(today.slice(0, 4))
  return [...occasionsOf(year), ...occasionsOf(year + 1)]
    .map((o) => ({ ...o, daysUntil: daysBetween(today, o.date) }))
    .filter((o) => o.daysUntil >= 0 && o.daysUntil <= o.lead)
    .sort((a, b) => a.daysUntil - b.daysUntil)
}

/** Data local (AAAA-MM-DD) no fuso da loja. */
export function localDate(now: Date, timeZone = 'America/Sao_Paulo'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Fim do dia (meia-noite seguinte) de uma data no fuso da loja, em ISO. */
export function endOfLocalDay(date: string, timeZone = 'America/Sao_Paulo'): string {
  const [y, m, d] = date.split('-').map(Number)
  const noon = new Date(Date.UTC(y, m - 1, d, 12))
  const local = new Date(noon.toLocaleString('en-US', { timeZone }))
  const offsetMs = noon.getTime() - local.getTime()
  return new Date(new Date(y, m - 1, d + 1, 0, 0, 0).getTime() + offsetMs).toISOString()
}
