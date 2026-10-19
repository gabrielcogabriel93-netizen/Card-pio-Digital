'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { logError } from '@/lib/logger'
import { formatBRL } from '@/lib/money'
import { formatPhoneNumber } from '@/lib/phone'
import { toast } from '@/components/Feedback'
import { SmartImage } from '@/components/SmartImage'
import { OpenPushSettings } from '@/components/painel/OpenPushSettings'
import { AUDIENCE_LABELS, PUSH_BODY_MAX, PUSH_TITLE_MAX, type Audience } from '@/lib/pushAudience'
import {
  Bell, BellRing, Cake, Loader2, MousePointerClick, Send, ShoppingCart, Smartphone, UserCheck, UserX,
} from 'lucide-react'

interface Store {
  id: string
  name: string
  slug: string
  logo_url: string | null
  abandoned_cart_minutes: number | null
  inactive_customer_days: number | null
}
interface Device {
  id: string
  customer_name: string | null
  customer_phone: string | null
  platform: string | null
  installed: boolean
  notifications_enabled: boolean
  last_seen_at: string
}
interface Campaign {
  id: string
  title: string
  body: string
  audience: Audience
  source: string
  target_count: number
  sent_count: number
  failed_count: number
  click_count: number
  created_at: string
}
interface Product { id: string; name: string; price: number; image_url: string | null }
interface Customer { id: string; name: string; phone: string; birth_date?: string | null; last_order_at?: string | null }
interface Cart { id: string; customer_phone: string; customer_name: string | null; cart_total: number; updated_at: string }

const BROADCAST_AUDIENCES: Audience[] = ['all', 'recent', 'inactive', 'birthday']
const digits = (s: string | null | undefined) => (s || '').replace(/\D/g, '')
const firstName = (s: string | null | undefined) => (s || '').trim().split(/\s+/)[0] || ''
const ago = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 60) return `há ${Math.max(1, min)} min`
  if (min < 1440) return `há ${Math.round(min / 60)} h`
  return `há ${Math.round(min / 1440)} d`
}

export default function NotificacoesPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary-500" size={32} /></div>}>
      <Notificacoes />
    </Suspense>
  )
}

function Notificacoes() {
  const supabase = useMemo(() => createClient(), [])
  const params = useSearchParams()
  const [store, setStore] = useState<Store | null>(null)
  const [devices, setDevices] = useState<Device[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [birthdays, setBirthdays] = useState<Customer[]>([])
  const [inactive, setInactive] = useState<Customer[]>([])
  const [carts, setCarts] = useState<Cart[]>([])
  const [loading, setLoading] = useState(true)

  const [title, setTitle] = useState(params.get('title') || '')
  const [body, setBody] = useState(params.get('body') || '')
  const [productId, setProductId] = useState(params.get('product') || '')
  const [audience, setAudience] = useState<Audience>('all')
  const [reach, setReach] = useState<number | null>(null)
  const [sending, setSending] = useState<string | null>(null)
  const source = params.get('source') === 'sugestao' ? 'sugestao' : 'manual'

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: est } = await supabase
        .from('establishments')
        .select('id, name, slug, logo_url, abandoned_cart_minutes, inactive_customer_days')
        .eq('owner_id', user.id)
        .single()
      if (!est) return
      setStore(est as Store)
      const cartCut = new Date(Date.now() - (est.abandoned_cart_minutes ?? 15) * 60_000).toISOString()
      const inactiveCut = new Date(Date.now() - (est.inactive_customer_days ?? 20) * 86400e3).toISOString()
      const [dev, camp, prod, cust, inact, cart] = await Promise.all([
        supabase.from('customer_devices').select('id, customer_name, customer_phone, platform, installed, notifications_enabled, last_seen_at').eq('establishment_id', est.id).order('last_seen_at', { ascending: false }).limit(500),
        supabase.from('push_campaigns').select('*').eq('establishment_id', est.id).order('created_at', { ascending: false }).limit(30),
        supabase.from('products').select('id, name, price, image_url').eq('establishment_id', est.id).eq('is_active', true).order('name'),
        supabase.from('customers').select('id, name, phone, birth_date').eq('establishment_id', est.id).not('birth_date', 'is', null),
        supabase.from('customers').select('id, name, phone, last_order_at').eq('establishment_id', est.id).not('last_order_at', 'is', null).lt('last_order_at', inactiveCut).order('last_order_at').limit(50),
        supabase.from('cart_drafts').select('id, customer_phone, customer_name, cart_total, updated_at').eq('establishment_id', est.id).is('recovered_at', null).lt('updated_at', cartCut).order('updated_at', { ascending: false }).limit(30),
      ])
      setDevices((dev.data || []) as Device[])
      setCampaigns((camp.data || []) as Campaign[])
      setProducts((prod.data || []) as Product[])
      const today = new Intl.DateTimeFormat('en-CA', { month: '2-digit', day: '2-digit' }).format(new Date())
      setBirthdays(((cust.data || []) as Customer[]).filter((c) => (c.birth_date || '').slice(5, 10) === today))
      setInactive((inact.data || []) as Customer[])
      setCarts((cart.data || []) as Cart[])
    } catch (err) {
      logError('painel:notificacoes', 'erro ao carregar', err)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => { load() }, [load])

  // Quantos aparelhos o público alcança.
  useEffect(() => {
    if (!store) return
    let alive = true
    setReach(null)
    fetch(`/api/push/campaign?audience=${audience}`).then((r) => r.json()).then((d) => alive && setReach(d.count ?? 0)).catch(() => {})
    return () => { alive = false }
  }, [audience, store])

  const reachable = useMemo(() => new Set(devices.filter((d) => d.notifications_enabled && d.customer_phone).map((d) => d.customer_phone!)), [devices])
  const stats = useMemo(() => ({
    active: devices.filter((d) => d.notifications_enabled).length,
    installed: devices.filter((d) => d.installed).length,
    identified: new Set(devices.filter((d) => d.customer_phone).map((d) => d.customer_phone)).size,
    clicks: campaigns.reduce((s, c) => s + c.click_count, 0),
  }), [devices, campaigns])

  const send = async (payload: { title: string; body: string; audience: Audience; audience_value?: string; product_id?: string; source: string }, key: string) => {
    setSending(key)
    try {
      const res = await fetch('/api/push/campaign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Não foi possível enviar.')
      toast.success(`Enviada para ${data.sent} aparelho${data.sent === 1 ? '' : 's'}.`)
      if (key === 'compose') { setTitle(''); setBody(''); setProductId('') }
      load()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSending(null)
    }
  }

  const product = products.find((p) => p.id === productId)

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary-500" size={32} /></div>
  if (!store) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Notificações</h1>
        <p className="text-gray-600 mt-1">
          Fale com seus clientes direto no celular deles, pelo app da {store.name}. Sem custo por mensagem e sem depender do WhatsApp.
        </p>
      </div>

      {/* Números */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: BellRing, label: 'Com avisos ativos', value: stats.active },
          { icon: Smartphone, label: 'Com o app instalado', value: stats.installed },
          { icon: UserCheck, label: 'Clientes identificados', value: stats.identified },
          { icon: MousePointerClick, label: 'Cliques nas mensagens', value: stats.clicks },
        ].map((s) => (
          <div key={s.label} className="card py-4">
            <s.icon size={18} className="text-primary-600" />
            <p className="text-2xl font-bold text-gray-900 mt-2 tabular-nums">{s.value}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {stats.active === 0 && (
        <div className="card bg-primary-50 border border-primary-100 text-sm text-gray-700">
          Ninguém ativou os avisos ainda. Depois de cada pedido, o cliente vê o convite para instalar o app da {store.name} e ativar os avisos.
          Divulgue o link do cardápio (em <a href="/painel/divulgar" className="underline">Divulgar minha loja</a>) para a lista crescer.
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        {/* Nova mensagem */}
        <section className="card space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><Send size={18} /> Nova mensagem</h2>
          <div>
            <label htmlFor="n-title" className="block text-sm font-medium text-gray-700 mb-1">Título</label>
            <input id="n-title" className="input-field" maxLength={PUSH_TITLE_MAX} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sextou com pizza em dobro! 🍕" />
          </div>
          <div>
            <label htmlFor="n-body" className="block text-sm font-medium text-gray-700 mb-1">Mensagem</label>
            <textarea id="n-body" className="input-field" rows={3} maxLength={PUSH_BODY_MAX} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Peça hoje e ganhe a borda recheada. Toque para pedir." />
            <p className="text-xs text-gray-400 text-right">{body.length}/{PUSH_BODY_MAX}</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="n-product" className="block text-sm font-medium text-gray-700 mb-1">Abrir no produto <span className="text-gray-400 font-normal">(opcional)</span></label>
              <select id="n-product" className="input-field" value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">Cardápio inteiro</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} · {formatBRL(Number(p.price))}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="n-aud" className="block text-sm font-medium text-gray-700 mb-1">Para quem</label>
              <select id="n-aud" className="input-field" value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
                {BROADCAST_AUDIENCES.map((a) => <option key={a} value={a}>{AUDIENCE_LABELS[a]}</option>)}
              </select>
              <p className="text-xs text-gray-500 mt-1">{reach === null ? 'Calculando…' : `${reach} aparelho${reach === 1 ? '' : 's'} vão receber`}</p>
            </div>
          </div>
          {reach === 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
              <p className="font-medium">Ninguém desse público está com os avisos ativos ainda, então não há para quem enviar.</p>
              <p className="mt-1">
                O cliente ativa os avisos no convite que aparece depois do pedido (e, no app instalado, no topo do cardápio).
                No iPhone, ele precisa primeiro adicionar o cardápio à Tela de Início e abrir pelo ícone. Peça para seus clientes
                ativarem quando fizerem o próximo pedido.
              </p>
            </div>
          )}
          <button
            onClick={() => send({ title, body, audience, product_id: productId || undefined, source }, 'compose')}
            disabled={!title.trim() || !body.trim() || !reach || sending === 'compose'}
            className="btn-primary w-full sm:w-auto"
          >
            {sending === 'compose' ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />} Enviar agora
          </button>
          <p className="text-xs text-gray-500">Até 3 mensagens para vários clientes por dia. Mais que isso faz o cliente desligar os avisos.</p>
        </section>

        {/* Prévia */}
        <aside className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Como aparece no celular</p>
          <div className="rounded-2xl bg-gray-900/90 p-3 text-white shadow-lg">
            <div className="flex items-start gap-3">
              <div className="relative w-9 h-9 rounded-lg overflow-hidden bg-white flex-shrink-0">
                {store.logo_url ? <SmartImage src={store.logo_url} alt="" fill sizes="36px" className="object-cover" /> : <Bell size={18} className="text-primary-600 m-2" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs opacity-70">{store.name} · agora</p>
                <p className="font-semibold text-sm truncate">{title || 'Título da mensagem'}</p>
                <p className="text-sm opacity-90 line-clamp-3">{body || 'Texto da mensagem para seus clientes.'}</p>
              </div>
            </div>
            {product?.image_url && (
              <div className="relative w-full aspect-[2/1] rounded-xl overflow-hidden mt-3">
                <SmartImage src={product.image_url} alt="" fill sizes="320px" className="object-cover" />
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500">No Android e no computador a foto do produto aparece grande. No iPhone, só o texto.</p>
        </aside>
      </div>

      <OpenPushSettings storeId={store.id} storeName={store.name} products={products} />

      {/* Públicos prontos */}
      <div className="grid lg:grid-cols-3 gap-4">
        <section className="card">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Cake size={17} className="text-pink-500" /> Aniversariantes de hoje</h2>
          {birthdays.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">Ninguém faz aniversário hoje.</p>
          ) : (
            <ul className="divide-y divide-gray-100 mt-2">
              {birthdays.map((c) => (
                <li key={c.id} className="py-2 flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{c.name}</span>
                  {reachable.has(digits(c.phone)) ? (
                    <button
                      onClick={() => send({ title: `Feliz aniversário, ${firstName(c.name)}! 🎂`, body: `A ${store.name} deseja um dia muito especial pra você. Tem um carinho esperando no nosso cardápio!`, audience: 'customer', audience_value: c.phone, source: 'aniversario' }, c.id)}
                      disabled={sending === c.id}
                      className="btn-secondary text-xs py-1.5 px-2.5"
                    >
                      {sending === c.id ? <Loader2 size={14} className="animate-spin" /> : 'Enviar parabéns'}
                    </button>
                  ) : <span className="text-xs text-gray-400">sem app</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><UserX size={17} className="text-amber-500" /> Clientes sumidos</h2>
          <p className="text-sm text-gray-600 mt-1">{inactive.length} cliente{inactive.length === 1 ? '' : 's'} sem pedir há {store.inactive_customer_days ?? 20} dias ou mais · {inactive.filter((c) => reachable.has(digits(c.phone))).length} com o app.</p>
          <button
            onClick={() => send({ title: 'Saudade de você! 👋', body: `Faz tempo que você não pede na ${store.name}. Dá uma olhada nas novidades do cardápio!`, audience: 'inactive', source: 'sumido' }, 'inactive')}
            disabled={!inactive.some((c) => reachable.has(digits(c.phone))) || sending === 'inactive'}
            className="btn-secondary text-sm mt-3 w-full"
          >
            {sending === 'inactive' ? <Loader2 size={16} className="animate-spin" /> : 'Chamar de volta'}
          </button>
        </section>

        <section className="card">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><ShoppingCart size={17} className="text-primary-600" /> Carrinhos abandonados</h2>
          {carts.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">Nenhum carrinho parado agora.</p>
          ) : (
            <ul className="divide-y divide-gray-100 mt-2">
              {carts.map((c) => (
                <li key={c.id} className="py-2 flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate">{c.customer_name || formatPhoneNumber(c.customer_phone)}</span>
                    <span className="text-xs text-gray-500">{formatBRL(Number(c.cart_total))} · {ago(c.updated_at)}</span>
                  </span>
                  {reachable.has(digits(c.customer_phone)) ? (
                    <button
                      onClick={() => send({ title: `Seu pedido ficou na sacola 🛍️`, body: `${firstName(c.customer_name) ? firstName(c.customer_name) + ', s' : 'S'}ua sacola na ${store.name} está te esperando. Toque para finalizar.`, audience: 'customer', audience_value: c.customer_phone, source: 'carrinho' }, c.id)}
                      disabled={sending === c.id}
                      className="btn-secondary text-xs py-1.5 px-2.5"
                    >
                      {sending === c.id ? <Loader2 size={14} className="animate-spin" /> : 'Lembrar'}
                    </button>
                  ) : <span className="text-xs text-gray-400">sem app</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Histórico */}
      <section className="card overflow-x-auto">
        <h2 className="font-semibold text-gray-900 mb-3">Mensagens enviadas</h2>
        {campaigns.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma mensagem enviada ainda.</p>
        ) : (
          <table className="w-full text-sm min-w-[560px]">
            <thead className="text-left text-xs text-gray-500">
              <tr><th className="py-2">Mensagem</th><th>Para</th><th className="text-right">Entregues</th><th className="text-right">Cliques</th><th className="text-right">Quando</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 pr-3"><p className="font-medium text-gray-900 truncate max-w-[280px]">{c.title}</p><p className="text-xs text-gray-500 truncate max-w-[280px]">{c.body}</p></td>
                  <td className="text-xs text-gray-600">{AUDIENCE_LABELS[c.audience] || c.audience}</td>
                  <td className="text-right tabular-nums">{c.sent_count}/{c.target_count}</td>
                  <td className="text-right tabular-nums">{c.click_count}{c.sent_count > 0 ? <span className="text-xs text-gray-400"> ({Math.round((c.click_count / c.sent_count) * 100)}%)</span> : null}</td>
                  <td className="text-right text-xs text-gray-500 whitespace-nowrap">{ago(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Aparelhos */}
      <section className="card overflow-x-auto">
        <h2 className="font-semibold text-gray-900 mb-3">Aparelhos dos clientes</h2>
        {devices.length === 0 ? (
          <p className="text-sm text-gray-400">Assim que alguém instalar o app ou ativar os avisos, aparece aqui.</p>
        ) : (
          <table className="w-full text-sm min-w-[520px]">
            <thead className="text-left text-xs text-gray-500">
              <tr><th className="py-2">Cliente</th><th>Aparelho</th><th>App</th><th>Avisos</th><th className="text-right">Última visita</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {devices.slice(0, 200).map((d) => (
                <tr key={d.id}>
                  <td className="py-2">{d.customer_name || (d.customer_phone ? formatPhoneNumber(d.customer_phone) : <span className="text-gray-400">Visitante</span>)}</td>
                  <td className="text-xs text-gray-600">{d.platform === 'ios' ? 'iPhone' : d.platform === 'android' ? 'Android' : 'Computador'}</td>
                  <td>{d.installed ? <span className="text-xs text-green-700 bg-green-50 px-1.5 py-0.5 rounded">Instalado</span> : <span className="text-xs text-gray-400">Navegador</span>}</td>
                  <td>{d.notifications_enabled ? <span className="text-xs text-primary-700 bg-primary-50 px-1.5 py-0.5 rounded">Ativos</span> : <span className="text-xs text-gray-400">Desligados</span>}</td>
                  <td className="text-right text-xs text-gray-500">{ago(d.last_seen_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
