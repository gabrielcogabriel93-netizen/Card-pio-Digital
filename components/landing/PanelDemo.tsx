'use client'

// "Teste o painel": uma loja de mentira que vive só no navegador do
// visitante. O que ele muda no painel aparece na hora no celular ao lado.
// Nada é salvo e nada vai para o banco (nem para a loja de demonstração).
import { useEffect, useMemo, useRef, useState } from 'react'
import { BadgePercent, Bell, Box, ChefHat, Palette, Printer, RotateCcw, ShoppingCart, UtensilsCrossed } from 'lucide-react'

type Tab = 'pedidos' | 'cardapio' | 'promocoes' | 'aparencia'
type Status = 'novo' | 'preparo' | 'saiu' | 'entregue'
interface DemoProduct { id: string; name: string; desc: string; price: number; soldOut: boolean; promo: number | null; from: string; to: string; has3D?: boolean }
interface DemoOrder { id: number; customer: string; items: string; total: number; status: Status; printed: boolean; at: string }
interface Promo { key: string; title: string; why: string; kind: 'preco' | 'cupom' | 'frete' | 'data'; tag?: string }

const COLORS = ['#E4572E', '#2340E0', '#0B8A5F', '#8B3FD9', '#D61F69', '#14172B']
const START_PRODUCTS: DemoProduct[] = [
  { id: 'cal', name: 'Calabresa', desc: 'Mussarela, calabresa e cebola roxa', price: 49.9, soldOut: false, promo: null, from: '#F2A65A', to: '#C8452B', has3D: true },
  { id: 'qq', name: 'Quatro queijos', desc: 'Mussarela, provolone, parmesão e catupiry', price: 54.9, soldOut: false, promo: null, from: '#F7D774', to: '#E39B3B' },
  { id: 'mar', name: 'Marguerita', desc: 'Tomate, mussarela e manjericão fresco', price: 46.9, soldOut: false, promo: null, from: '#9BCB6B', to: '#4E8B3A' },
  { id: 'ref', name: 'Refrigerante 2 litros', desc: 'Coca-Cola, Guaraná ou Fanta', price: 14, soldOut: false, promo: null, from: '#7FB2F0', to: '#2F5FB3' },
]
const PROMOS: Promo[] = [
  { key: 'mar', kind: 'preco', title: 'Prato da semana: Marguerita por R$ 41,90', why: 'É a que menos vende. Com 11% de desconto, basta vender 18% a mais para o lucro empatar.' },
  { key: 'black', kind: 'data', tag: 'Black Friday · em 15 dias', title: 'Black Friday: cupom BLACK15 (15%)', why: 'O cliente passa a semana procurando desconto. O cupom some sozinho no fim do dia da data.' },
  { key: 'bemvindo', kind: 'cupom', title: 'Cupom de primeira compra: BEMVINDO10', why: '10% uma vez por cliente: o empurrão para quem ainda não pediu testar a loja.' },
  { key: 'frete', kind: 'frete', title: 'Entrega grátis acima de R$ 80', why: 'Seu ticket médio é R$ 62. Quem está perto adiciona um item para ganhar o frete.' },
]
const CUSTOMERS = [['Ana Souza', '1 Calabresa G + Refri 2L'], ['Bruno Lima', '2 Quatro queijos'], ['Carla Dias', '1 Marguerita + 1 Calabresa'], ['Diego Rocha', '1 Calabresa G']]
const STATUS_FLOW: Record<Status, { next: Status | null; action: string; label: string }> = {
  novo: { next: 'preparo', action: 'Aceitar', label: 'Novo' },
  preparo: { next: 'saiu', action: 'Saiu para entrega', label: 'Em preparo' },
  saiu: { next: 'entregue', action: 'Concluir', label: 'Saiu para entrega' },
  entregue: { next: null, action: '', label: 'Entregue' },
}
const brl = (n: number) => n.toFixed(2).replace('.', ',')
const now = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

export function PanelDemo() {
  const [tab, setTab] = useState<Tab>('pedidos')
  const [color, setColor] = useState(COLORS[0])
  const [name, setName] = useState('Bella Massa')
  const [open, setOpen] = useState(true)
  const [products, setProducts] = useState<DemoProduct[]>(START_PRODUCTS)
  const [applied, setApplied] = useState<string[]>([])
  const [orders, setOrders] = useState<DemoOrder[]>([{ id: 482, customer: 'Ana Souza', items: '1 Calabresa G + Refri 2L', total: 63.9, status: 'novo', printed: false, at: '19:21' }])
  const [autoPrint, setAutoPrint] = useState(true)
  const [ringing, setRinging] = useState(true)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const nextId = useRef(483)
  const toastTimer = useRef<number | undefined>(undefined)

  const flash = (msg: string) => {
    setToastMsg(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2600)
  }
  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  const latest = orders[0]
  const phoneView: 'menu' | 'tracking' = tab === 'pedidos' && latest ? 'tracking' : 'menu'
  const freeShipping = applied.includes('frete')
  const banners = useMemo(() => {
    const list: { title: string; sub: string }[] = []
    if (applied.includes('black')) list.push({ title: 'Black Friday: 15% off', sub: 'Cupom BLACK15 · só até sexta' })
    if (applied.includes('mar')) list.push({ title: 'Marguerita por R$ 41,90', sub: 'Prato da semana · de R$ 46,90' })
    if (applied.includes('bemvindo')) list.push({ title: 'Primeira compra? BEMVINDO10', sub: '10% de desconto no 1º pedido' })
    return list
  }, [applied])

  const reset = () => {
    setTab('pedidos'); setColor(COLORS[0]); setName('Bella Massa'); setOpen(true); setProducts(START_PRODUCTS); setApplied([])
    setOrders([{ id: 482, customer: 'Ana Souza', items: '1 Calabresa G + Refri 2L', total: 63.9, status: 'novo', printed: false, at: '19:21' }])
    setAutoPrint(true); setRinging(true); nextId.current = 483; flash('Demonstração reiniciada')
  }

  const simulateOrder = () => {
    const [customer, items] = CUSTOMERS[nextId.current % CUSTOMERS.length]
    const total = 40 + ((nextId.current * 37) % 50) + 0.9
    setOrders((list) => [{ id: nextId.current++, customer, items, total, status: 'novo' as Status, printed: false, at: now() }, ...list].slice(0, 5))
    setRinging(true)
    flash('Pedido novo! A campainha toca até alguém aceitar.')
  }
  const advance = (id: number) => {
    setOrders((list) => list.map((o) => {
      if (o.id !== id) return o
      const next = STATUS_FLOW[o.status].next
      if (!next) return o
      if (o.status === 'novo' && autoPrint) flash(`Comanda #${o.id} impressa na térmica`)
      return { ...o, status: next, printed: o.printed || (o.status === 'novo' && autoPrint) }
    }))
    setRinging((r) => r && orders.filter((o) => o.status === 'novo' && o.id !== id).length > 0)
  }

  const setProduct = (id: string, patch: Partial<DemoProduct>) => setProducts((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  const togglePromo = (p: Promo) => {
    const on = applied.includes(p.key)
    setApplied((list) => (on ? list.filter((k) => k !== p.key) : [...list, p.key]))
    if (p.key === 'mar') setProduct('mar', { promo: on ? null : 41.9 })
    flash(on ? 'Promoção encerrada: saiu do cardápio' : 'Aplicada: já está no cardápio, com banner')
  }

  const tabs: { id: Tab; label: string; icon: typeof Bell; badge?: number }[] = [
    { id: 'pedidos', label: 'Pedidos', icon: ShoppingCart, badge: orders.filter((o) => o.status === 'novo').length },
    { id: 'cardapio', label: 'Cardápio', icon: UtensilsCrossed },
    { id: 'promocoes', label: 'Promoções', icon: BadgePercent },
    { id: 'aparencia', label: 'Aparência', icon: Palette },
  ]

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_auto] gap-8 items-start">
      {/* Painel */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden min-w-0">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 border-b border-gray-200">
          <span className="w-3 h-3 rounded-full bg-red-400" /><span className="w-3 h-3 rounded-full bg-amber-400" /><span className="w-3 h-3 rounded-full bg-green-400" />
          <span className="ml-3 flex-1 min-w-0 truncate text-xs text-gray-500 bg-white rounded-md px-3 py-1">fregues.app/painel · loja de teste</span>
          <button type="button" onClick={reset} className="text-xs text-gray-600 hover:text-gray-900 inline-flex items-center gap-1 flex-shrink-0"><RotateCcw size={13} /> Recomeçar</button>
        </div>
        <div className="sm:grid sm:grid-cols-[170px_minmax(0,1fr)]">
          <nav className="flex sm:flex-col gap-1 p-2 sm:p-3 border-b sm:border-b-0 sm:border-r border-gray-100 overflow-x-auto" aria-label="Seções do painel de teste">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap ${tab === t.id ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50'}`}
                aria-current={tab === t.id ? 'page' : undefined}
              >
                <t.icon size={16} /> {t.label}
                {!!t.badge && <span className="ml-auto text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5">{t.badge}</span>}
              </button>
            ))}
          </nav>

          <div className="p-4 sm:p-5 sm:min-h-[430px] min-w-0">
            {tab === 'pedidos' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <h3 className="font-display font-extrabold text-lg text-gray-900">Pedidos de hoje</h3>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setAutoPrint((v) => !v)} className={`text-xs font-semibold rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 ${autoPrint ? 'bg-primary-50 text-primary-700' : 'bg-gray-100 text-gray-600'}`}>
                      <Printer size={14} /> {autoPrint ? 'Impressão automática ativa' : 'Ativar impressão automática'}
                    </button>
                    <button type="button" onClick={simulateOrder} className="btn-primary text-xs py-1.5 px-3"><Bell size={14} /> Simular pedido novo</button>
                  </div>
                </div>
                {ringing && orders.some((o) => o.status === 'novo') && (
                  <p className="flex items-center gap-2 text-sm font-semibold text-red-700 bg-red-50 rounded-lg px-3 py-2"><Bell size={16} className="animate-bounce" /> Pedido esperando: a campainha toca até alguém aceitar</p>
                )}
                <ul className="space-y-2">
                  {orders.map((o) => (
                    <li key={o.id} className={`rounded-xl border p-3 flex flex-wrap items-center gap-3 ${o.status === 'novo' ? 'border-amber-300 bg-amber-50/60' : 'border-gray-200'}`}>
                      <div className="flex-1 min-w-[10rem]">
                        <p className="font-semibold text-gray-900 text-sm">#{o.id} · {o.customer} <span className="text-gray-400 font-normal">· {o.at}</span></p>
                        <p className="text-xs text-gray-600">{o.items} · <span className="tabular-nums font-semibold">R$ {brl(o.total)}</span></p>
                        <p className="text-[11px] mt-1 flex flex-wrap gap-1.5">
                          <span className={`rounded-full px-2 py-0.5 font-semibold ${o.status === 'novo' ? 'bg-amber-200 text-amber-900' : o.status === 'entregue' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>{STATUS_FLOW[o.status].label}</span>
                          {o.printed && <span className="rounded-full px-2 py-0.5 bg-gray-100 text-gray-700 inline-flex items-center gap-1"><Printer size={11} /> comanda impressa</span>}
                        </p>
                      </div>
                      {STATUS_FLOW[o.status].next && (
                        <button type="button" onClick={() => advance(o.id)} className={`text-sm font-semibold rounded-lg px-3 py-2 ${o.status === 'novo' ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-900 text-white hover:bg-gray-800'}`}>
                          {o.status === 'preparo' ? <span className="inline-flex items-center gap-1"><ChefHat size={14} /> {STATUS_FLOW[o.status].action}</span> : STATUS_FLOW[o.status].action}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-gray-500">Avance o pedido e veja o celular do cliente: cada etapa chega para ele na hora, também por notificação.</p>
              </div>
            )}

            {tab === 'cardapio' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display font-extrabold text-lg text-gray-900">Cardápio</h3>
                  <label className="inline-flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <input id="demo-open" type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} className="rounded text-primary-600" />
                    Loja aberta agora
                  </label>
                </div>
                <ul className="space-y-2">
                  {products.map((p) => (
                    <li key={p.id} className="rounded-xl border border-gray-200 p-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 items-center">
                      <input id={`demo-name-${p.id}`} aria-label={`Nome de ${p.name}`} className="input-field text-sm py-1.5" value={p.name} onChange={(e) => setProduct(p.id, { name: e.target.value })} />
                      <PriceInput id={`demo-price-${p.id}`} label={`Preço de ${p.name}`} value={p.price} onChange={(v) => setProduct(p.id, { price: v })} />
                      <div className="col-span-2 flex flex-wrap gap-2">
                        <button type="button" onClick={() => setProduct(p.id, { soldOut: !p.soldOut })} className={`text-xs font-semibold rounded-full px-2.5 py-1 ${p.soldOut ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-800'}`}>
                          {p.soldOut ? 'Acabou hoje' : 'Disponível'}
                        </button>
                        <button type="button" onClick={() => setProduct(p.id, { promo: p.promo ? null : Math.max(0.9, Math.floor(p.price * 0.9) + 0.9 > p.price * 0.92 ? Math.floor(p.price * 0.9) - 0.1 : Math.floor(p.price * 0.9) + 0.9) })} className={`text-xs font-semibold rounded-full px-2.5 py-1 ${p.promo ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
                          {p.promo ? `Oferta: R$ ${brl(p.promo)}` : 'Colocar em oferta'}
                        </button>
                        {p.has3D && <span className="text-xs font-semibold rounded-full px-2.5 py-1 bg-gray-900 text-amber-300 inline-flex items-center gap-1"><Box size={12} /> 3D na mesa</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {tab === 'promocoes' && (
              <div className="space-y-3">
                <h3 className="font-display font-extrabold text-lg text-gray-900">Sugestões de promoções da semana</h3>
                <p className="text-sm text-gray-600">O Freguês olha suas vendas, seus pratos e as datas comemorativas e sugere a oferta com a conta do lucro. Um toque aplica no cardápio, com banner.</p>
                {PROMOS.map((p) => {
                  const on = applied.includes(p.key)
                  return (
                    <div key={p.key} className={`rounded-xl border p-3 space-y-1.5 ${on ? 'border-green-300 bg-green-50/60' : 'border-gray-200'}`}>
                      {p.tag && <span className="inline-block text-[11px] font-semibold rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">{p.tag}</span>}
                      <p className="font-semibold text-gray-900 text-sm">{p.title}</p>
                      <p className="text-xs text-gray-600">{p.why}</p>
                      <button type="button" onClick={() => togglePromo(p)} className={`text-xs font-semibold rounded-lg px-3 py-1.5 ${on ? 'bg-white border border-gray-300 text-gray-700' : 'bg-primary-600 text-white'}`}>
                        {on ? 'Encerrar' : 'Aplicar no cardápio'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {tab === 'aparencia' && (
              <div className="space-y-5">
                <h3 className="font-display font-extrabold text-lg text-gray-900">Aparência da loja</h3>
                <div>
                  <label htmlFor="demo-store-name" className="text-sm font-medium text-gray-700">Nome da loja</label>
                  <input id="demo-store-name" className="input-field mt-1" value={name} maxLength={28} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Cor da marca</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {COLORS.map((c) => (
                      <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Cor ${c}`} className={`w-9 h-9 rounded-full border-2 ${color === c ? 'border-gray-900 scale-110' : 'border-white'} shadow`} style={{ background: c }} />
                    ))}
                    <label className="inline-flex items-center gap-2 text-sm text-gray-600 ml-1">
                      <input id="demo-color" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-9 h-9 rounded cursor-pointer border border-gray-200" /> outra cor
                    </label>
                  </div>
                </div>
                <p className="text-sm text-gray-600">No painel de verdade você também envia o logo, a capa, os horários, as formas de pagamento e as taxas por bairro.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Celular do cliente */}
      <div className="flex flex-col items-center gap-3 lg:sticky lg:top-24">
        <div className="relative w-[260px] h-[540px] rounded-[2.4rem] border-[9px] border-ink bg-ink shadow-2xl overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-4 bg-ink rounded-b-xl z-20" />
          <div className="h-full bg-[#F6F7FB] text-ink overflow-hidden relative text-[11px]">
            {phoneView === 'menu' ? (
              <>
                <div className="bg-white px-3 pt-7 pb-2">
                  <div className="flex gap-2 items-center">
                    <div className="w-10 h-10 rounded-xl text-white font-extrabold flex items-center justify-center font-display text-base" style={{ background: color }}>{(name.trim()[0] || 'L').toUpperCase()}</div>
                    <div className="min-w-0">
                      <p className="font-display font-extrabold text-sm truncate">{name || 'Sua loja'}</p>
                      <p className={`font-semibold ${open ? 'text-green-700' : 'text-red-600'}`}>{open ? '● Aberto · até 23:00' : '● Fechado · abre às 18:00'}</p>
                    </div>
                  </div>
                  <div className="flex gap-1 mt-2 flex-wrap">
                    <span className="rounded-full px-1.5 py-0.5 border border-gray-200">🛵 30–45 min</span>
                    <span className="rounded-full px-1.5 py-0.5 border border-gray-200">Entrega R$ 5</span>
                    {freeShipping && <span className="rounded-full px-1.5 py-0.5 bg-green-50 text-green-800">Grátis acima de R$ 80</span>}
                  </div>
                </div>
                {banners.length > 0 && (
                  <div className="mx-3 mt-2 rounded-xl text-white p-2.5" style={{ background: `linear-gradient(120deg, ${color}, #14172B)` }}>
                    <p className="font-display font-extrabold text-[13px] leading-tight">{banners[banners.length - 1].title}</p>
                    <p className="opacity-90">{banners[banners.length - 1].sub}</p>
                    {banners.length > 1 && <p className="mt-1 flex gap-1">{banners.map((_, i) => <span key={i} className={`h-1 rounded-full ${i === banners.length - 1 ? 'w-3 bg-white' : 'w-1 bg-white/50'}`} />)}</p>}
                  </div>
                )}
                <div className="mx-3 mt-2 bg-white rounded-lg px-2 py-1.5 text-gray-400 border border-gray-100">🔍 Buscar no cardápio</div>
                <div className="flex gap-1 px-3 py-2">
                  {['Pizzas', 'Bebidas'].map((t, i) => (
                    <span key={t} className="rounded-full px-2 py-0.5" style={i === 0 ? { background: color, color: '#fff' } : { background: '#fff', border: '1px solid #E5E7EB' }}>{t}</span>
                  ))}
                </div>
                {products.map((p) => (
                  <div key={p.id} className={`flex gap-2 mx-3 my-1.5 bg-white rounded-xl p-2 border border-gray-100 ${p.soldOut ? 'opacity-55' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold leading-tight truncate">{p.name || 'Produto'} {p.has3D && <span className="ml-0.5 text-[9px] font-bold text-amber-300 bg-gray-900 px-1 rounded">3D</span>}</p>
                      <p className="text-gray-500 leading-tight line-clamp-1">{p.desc}</p>
                      <p className="font-bold mt-0.5 tabular-nums">
                        {p.soldOut ? <span className="text-red-600">Acabou hoje</span> : p.promo ? (<><span className="text-gray-400 line-through font-medium mr-1">R$ {brl(p.price)}</span><span className="text-green-700">R$ {brl(p.promo)}</span></>) : <>R$ {brl(p.price)}</>}
                      </p>
                    </div>
                    <div className="relative w-11 h-11 rounded-lg flex-shrink-0" style={{ background: `linear-gradient(135deg, ${p.from}, ${p.to})` }}>
                      {!p.soldOut && <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full text-white flex items-center justify-center font-bold" style={{ background: color }}>+</span>}
                    </div>
                  </div>
                ))}
                <div className="absolute left-2 right-2 bottom-2 rounded-xl text-white font-bold px-3 py-2 flex justify-between" style={{ background: open ? color : '#9CA3AF' }}>
                  <span>{open ? '2 itens · Ver sacola' : 'Loja fechada agora'}</span><span>{open ? 'R$ 63,90' : ''}</span>
                </div>
              </>
            ) : (
              <Tracking order={latest} color={color} name={name} />
            )}
            {toastMsg && (
              <div className="absolute left-3 right-3 bottom-14 z-10 rounded-xl bg-gray-900 text-white px-3 py-2 shadow-lg animate-fade-in">{toastMsg}</div>
            )}
          </div>
        </div>
        <p className="text-sm text-gray-500 text-center max-w-[260px]">{phoneView === 'menu' ? 'Celular do cliente: muda na hora' : 'Celular do cliente acompanhando o pedido'}</p>
      </div>
    </div>
  )
}

function Tracking({ order, color, name }: { order: DemoOrder; color: string; name: string }) {
  const steps: [Status, string][] = [['novo', 'Pedido recebido'], ['preparo', 'Aceito · em preparo'], ['saiu', 'Saiu para entrega'], ['entregue', 'Entregue']]
  const idx = steps.findIndex(([s]) => s === order.status)
  const title = ['Aguardando a loja aceitar', 'Seu pedido está sendo preparado', 'Saiu para entrega', 'Pedido entregue. Bom apetite!'][idx]
  return (
    <div>
      <div className="text-white px-3 pt-8 pb-8" style={{ background: color }}>
        <p className="opacity-90">{name || 'Sua loja'} · #{order.id}</p>
        <p className="font-display font-extrabold text-lg leading-tight">{title}</p>
        <p>{order.customer} · R$ {brl(order.total)}</p>
      </div>
      <div className="mx-3 -mt-5 bg-white rounded-xl p-3 shadow-sm">
        {steps.map(([s, label], i) => (
          <div key={s} className="flex gap-2 py-1.5 items-center">
            <span className="w-4 h-4 rounded-full flex-shrink-0 transition-colors" style={{ background: i < idx ? color : i === idx ? '#FFD43B' : '#E5E7EB' }} />
            <p className={i > idx ? 'text-gray-400' : 'font-semibold'}>{label}</p>
          </div>
        ))}
      </div>
      <div className="mx-3 mt-3 rounded-xl p-2.5 bg-[#FFF4C9]"><strong>Notificação no celular:</strong> cada etapa avisa o cliente, mesmo com o app fechado.</div>
    </div>
  )
}

function PriceInput({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(brl(value))
  useEffect(() => { setText((t) => (parseFloat(t.replace(',', '.')) === value ? t : brl(value))) }, [value])
  return (
    <label className="flex items-center gap-1 text-sm text-gray-500">
      R$
      <input
        id={id}
        aria-label={label}
        inputMode="decimal"
        className="input-field text-sm py-1.5 w-20 tabular-nums"
        value={text}
        onChange={(e) => {
          const t = e.target.value.replace(/[^0-9,.]/g, '').replace('.', ',')
          setText(t)
          const v = parseFloat(t.replace(',', '.'))
          if (!Number.isNaN(v) && v > 0) onChange(Math.min(999, v))
        }}
        onBlur={() => setText(brl(value))}
      />
    </label>
  )
}
