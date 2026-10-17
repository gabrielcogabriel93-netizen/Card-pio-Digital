// Telas do cardápio desenhadas em código para a landing page. Seguem o
// layout real do cardápio (app/loja/[slug]/PublicMenuClient.tsx) com uma
// pizzaria de exemplo; a cor laranja é a da loja de exemplo, não da
// plataforma (no cardápio, quem manda é a marca da loja).

const STORE = '#E4572E'

function Phone({ children, size = 'md' }: { children: React.ReactNode; size?: 'sm' | 'md' }) {
  const w = size === 'sm' ? 'w-[176px] sm:w-[196px] h-[372px] sm:h-[414px]' : 'w-[240px] sm:w-[270px] h-[500px] sm:h-[560px]'
  return (
    <div className={`relative ${w} rounded-[2.2rem] border-[8px] border-ink bg-ink shadow-2xl overflow-hidden flex-shrink-0`}>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-3.5 bg-ink rounded-b-xl z-10" />
      <div className="h-full bg-[#F6F7FB] text-ink overflow-hidden relative" style={{ fontSize: size === 'sm' ? 9 : 11 }}>
        {children}
      </div>
    </div>
  )
}

function Item({ name, desc, price, from, to }: { name: string; desc: string; price: string; from: string; to: string }) {
  return (
    <div className="flex gap-2 mx-3 my-1.5 bg-white rounded-xl p-2 border border-gray-100">
      <div className="flex-1 min-w-0">
        <p className="font-bold leading-tight">{name}</p>
        <p className="text-gray-500 leading-tight line-clamp-2" style={{ fontSize: '0.85em' }}>{desc}</p>
        <p className="font-bold mt-1">{price}</p>
      </div>
      <div className="relative w-[3.6em] h-[3.6em] rounded-lg flex-shrink-0" style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}>
        <span className="absolute -bottom-1 -right-1 w-[1.7em] h-[1.7em] rounded-full text-white flex items-center justify-center font-bold" style={{ background: STORE }}>+</span>
      </div>
    </div>
  )
}

export function MenuScreen({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <Phone size={size}>
      <div className="bg-white px-3 pt-6 pb-2">
        <div className="flex gap-2 items-center">
          <div className="w-[3.2em] h-[3.2em] rounded-xl text-white font-extrabold flex items-center justify-center font-display" style={{ background: STORE, fontSize: '1.2em' }}>B</div>
          <div>
            <p className="font-display font-extrabold" style={{ fontSize: '1.25em' }}>Bella Massa</p>
            <p className="text-green-700 font-semibold">● Aberto · até 23:00</p>
          </div>
        </div>
        <div className="flex gap-1 mt-2 flex-wrap">
          {['🛵 30–45 min', 'Entrega R$ 5', 'Grátis acima de R$ 80'].map((c, i) => (
            <span key={c} className={`rounded-full px-1.5 py-0.5 border ${i === 2 ? 'bg-green-50 text-green-800 border-transparent' : 'border-gray-200'}`}>{c}</span>
          ))}
        </div>
      </div>
      <div className="mx-3 mt-2 bg-white rounded-lg px-2 py-1.5 text-gray-400 border border-gray-100">🔍 Buscar no cardápio</div>
      <div className="flex gap-1 px-3 py-2">
        {['Pizzas', 'Combos', 'Bebidas'].map((t, i) => (
          <span key={t} className="rounded-full px-2 py-0.5" style={i === 0 ? { background: STORE, color: '#fff' } : { background: '#fff', border: '1px solid #E5E7EB' }}>{t}</span>
        ))}
      </div>
      <p className="px-3 font-display font-extrabold" style={{ fontSize: '1.1em' }}>Pizzas</p>
      <Item name="Calabresa" desc="Mussarela, calabresa e cebola roxa" price="a partir de R$ 49,90" from="#F2A65A" to="#C8452B" />
      <Item name="Quatro queijos" desc="Mais pedida da semana" price="a partir de R$ 54,90" from="#F7D774" to="#E39B3B" />
      <Item name="Marguerita" desc="Tomate e manjericão fresco" price="a partir de R$ 46,90" from="#9BCB6B" to="#4E8B3A" />
      <div className="absolute left-2 right-2 bottom-2 rounded-xl text-white font-bold px-3 py-2 flex justify-between" style={{ background: STORE }}>
        <span>2 itens · Ver sacola</span><span>R$ 104,80</span>
      </div>
    </Phone>
  )
}

export function ProductScreen({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <Phone size={size}>
      <div className="h-[34%]" style={{ background: 'linear-gradient(135deg,#F2A65A,#C8452B)' }} />
      <div className="px-3 pt-2">
        <p className="font-display font-extrabold" style={{ fontSize: '1.3em' }}>Calabresa</p>
        <p className="text-gray-500">Mussarela, calabresa e cebola roxa</p>
        <div className="bg-gray-100 -mx-3 px-3 py-1.5 mt-2 flex justify-between items-center">
          <span className="font-bold">Tamanho<br /><span className="font-normal text-gray-500">Escolha 1</span></span>
          <span className="bg-green-100 text-green-700 font-bold rounded px-1">OK</span>
        </div>
        {[['Média', 'R$ 49,90', true], ['Grande', 'R$ 62,00', false]].map(([n, p, on]) => (
          <div key={n as string} className="flex justify-between py-1.5 border-b border-gray-100">
            <span>{n}</span><span>{p} {on ? '◉' : '○'}</span>
          </div>
        ))}
        <p className="font-bold mt-2">Alguma observação?</p>
        <div className="bg-white border border-gray-200 rounded-lg px-2 py-1.5 mt-1 text-gray-500">sem cebola, por favor</div>
      </div>
      <div className="absolute left-0 right-0 bottom-0 bg-white border-t border-gray-100 p-2 flex gap-2">
        <span className="border border-gray-200 rounded-lg px-2 py-1.5 font-bold">− 1 +</span>
        <span className="flex-1 rounded-lg text-white font-bold px-2 py-1.5 flex justify-between" style={{ background: STORE }}><span>Adicionar</span><span>R$ 49,90</span></span>
      </div>
    </Phone>
  )
}

export function CheckoutScreen({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <Phone size={size}>
      <div className="px-3 pt-6">
        <p className="font-display font-extrabold" style={{ fontSize: '1.2em' }}>Finalizar pedido</p>
        <p className="font-bold mt-2">Seus dados</p>
        <div className="bg-white border border-gray-200 rounded-lg px-2 py-1.5 mt-1">Ana Souza</div>
        <div className="bg-white border border-gray-200 rounded-lg px-2 py-1.5 mt-1">(11) 98888-7777</div>
        <p className="text-green-700 mt-1">Olá de novo, Ana! Seus endereços estão aqui.</p>
        <p className="font-bold mt-2">Como você quer receber?</p>
        <div className="grid grid-cols-2 gap-1 mt-1">
          <span className="rounded-lg border-2 text-center py-1 font-bold" style={{ borderColor: STORE, color: STORE }}>Entrega</span>
          <span className="rounded-lg border-2 border-gray-200 text-center py-1">Retirar</span>
        </div>
        <div className="rounded-lg border-2 p-1.5 mt-1" style={{ borderColor: STORE }}>
          <p className="font-bold">Casa</p><p className="text-gray-500">Rua das Flores, 120 · Centro</p>
        </div>
        <p className="font-bold mt-2">Pagamento</p>
        <div className="grid grid-cols-2 gap-1 mt-1">
          {['Pix na hora', 'Dinheiro', 'Crédito', 'Débito'].map((p, i) => (
            <span key={p} className="rounded-lg border-2 text-center py-1" style={i === 0 ? { borderColor: STORE, color: STORE, fontWeight: 700 } : { borderColor: '#E5E7EB' }}>{p}</span>
          ))}
        </div>
      </div>
      <div className="absolute left-2 right-2 bottom-2 rounded-xl text-white font-bold px-3 py-2 flex justify-between" style={{ background: STORE }}>
        <span>Fazer pedido</span><span>R$ 104,80</span>
      </div>
    </Phone>
  )
}

export function TrackingScreen({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const steps: [string, string, 'done' | 'now' | 'todo'][] = [
    ['Pedido recebido', '19:21', 'done'],
    ['Aceito · cerca de 35 min', '19:22', 'done'],
    ['Saiu para entrega', '19:42', 'now'],
    ['Entregue', '', 'todo'],
  ]
  return (
    <Phone size={size}>
      <div className="text-white px-3 pt-6 pb-8" style={{ background: STORE }}>
        <p className="opacity-90">Bella Massa · #0482</p>
        <p className="font-display font-extrabold" style={{ fontSize: '1.5em' }}>Saiu para entrega</p>
        <p>Chega até <strong>20:05</strong></p>
      </div>
      <div className="mx-3 -mt-5 bg-white rounded-xl p-2.5 shadow-sm">
        {steps.map(([label, at, state]) => (
          <div key={label} className="flex gap-2 py-1">
            <span className="w-[1.4em] h-[1.4em] rounded-full flex-shrink-0" style={{ background: state === 'done' ? STORE : state === 'now' ? '#FFD43B' : '#E5E7EB' }} />
            <div><p className={state === 'todo' ? 'text-gray-400' : 'font-semibold'}>{label}</p>{at && <p className="text-gray-500">{at}</p>}</div>
          </div>
        ))}
        <div className="grid grid-cols-2 gap-1 mt-1">
          <span className="rounded-lg border border-gray-200 text-center py-1">Falar com a loja</span>
          <span className="rounded-lg text-white text-center py-1 font-bold" style={{ background: STORE }}>Pedir de novo</span>
        </div>
      </div>
      <div className="mx-3 mt-2 rounded-xl p-2 bg-[#FFF4C9]"><strong>Faltam 40 pontos</strong> para uma broto grátis 🍕</div>
    </Phone>
  )
}
