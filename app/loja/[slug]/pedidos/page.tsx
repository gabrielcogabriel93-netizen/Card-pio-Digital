'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { logError } from '@/lib/logger'
import { generateColorShades, themeShadesToCssVars } from '@/lib/theme'
import { formatPhoneNumber } from '@/lib/phone'
import { formatBRL } from '@/lib/money'
import { orderItemsToPayload } from '@/lib/orderPayload'
import { getSavedCustomer, getCustomerToken, clearCustomerToken, saveCustomer, saveReorder } from '@/lib/customerStorage'
import { VerifyPhone } from '@/components/store/VerifyPhone'
import { toast, confirmDialog } from '@/components/Feedback'
import type { OrderItem, OrderStatus } from '@/types'
import { ArrowLeft, Loader2, ShoppingBag, Bike, Store, Trash2, RotateCcw, Cake, ChevronRight } from 'lucide-react'

interface OrderSummary {
  id: string
  status: OrderStatus
  items: OrderItem[]
  total: number
  order_type: 'delivery' | 'pickup' | 'mesa'
  source: 'online' | 'balcao' | 'mesa'
  created_at: string
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Aguardando a loja',
  confirmed: 'Aceito',
  preparing: 'Em preparo',
  completed: 'Concluído',
  cancelled: 'Cancelado',
}
const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-blue-100 text-blue-800',
  preparing: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
}

interface StoreInfo {
  id: string
  name: string
  theme_color: string | null
  birthday_discount_percent: number | null
}

export default function MeusPedidosPage({ params }: { params: { slug: string } }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [store, setStore] = useState<StoreInfo | null>(null)
  const [loadingStore, setLoadingStore] = useState(true)
  const [phone, setPhone] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [orders, setOrders] = useState<OrderSummary[] | null>(null)
  const [needsVerify, setNeedsVerify] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [birthDate, setBirthDate] = useState('')
  const [savingBirth, setSavingBirth] = useState(false)

  const themeStyle = useMemo(() => themeShadesToCssVars(generateColorShades(store?.theme_color)) as React.CSSProperties, [store?.theme_color])

  useEffect(() => {
    supabase
      .from('public_establishments')
      .select('id, name, theme_color, birthday_discount_percent')
      .eq('slug', params.slug)
      .maybeSingle()
      .then(({ data }) => {
        setStore(data as StoreInfo | null)
        setLoadingStore(false)
        const saved = getSavedCustomer()
        if (saved?.phone) setPhone(saved.phone)
      })
  }, [params.slug, supabase])

  const search = useCallback(async (targetPhone: string) => {
    if (!store || targetPhone.replace(/\D/g, '').length < 10) return
    const currentToken = getCustomerToken(store.id, targetPhone)
    setToken(currentToken)
    setError(null)
    if (!currentToken) {
      setOrders(null)
      setNeedsVerify(true)
      return
    }
    setSearching(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('get_orders_by_phone', { p_establishment_id: store.id, p_phone: targetPhone, p_token: currentToken })
      if (rpcError) throw rpcError
      setOrders((data || []) as OrderSummary[])
      setNeedsVerify(false)
      saveCustomer({ name: getSavedCustomer()?.name || '', phone: targetPhone })
      const profile = await supabase.rpc('get_customer_profile', { p_establishment_id: store.id, p_phone: targetPhone, p_token: currentToken })
      const birth = profile.data?.[0]?.birth_date
      if (birth) setBirthDate(birth)
    } catch (err: any) {
      if (/Confirme/.test(err?.message || '')) {
        clearCustomerToken(store.id, targetPhone)
        setToken(null)
        setNeedsVerify(true)
      } else {
        logError('loja:meus-pedidos', 'erro ao buscar pedidos', err)
        setError(err?.message?.includes('Muitas') ? err.message : 'Não foi possível buscar seus pedidos agora.')
      }
    } finally {
      setSearching(false)
    }
  }, [store, supabase])

  useEffect(() => {
    if (store && phone && orders === null && !needsVerify) search(phone)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store])

  const reorder = (order: OrderSummary) => {
    if (!store) return
    const payload = orderItemsToPayload(order.items)
    if (payload.length === 0) {
      toast('Esse pedido é antigo e não dá para repetir automaticamente. Monte de novo pelo cardápio.')
      return
    }
    saveReorder(store.id, payload)
    router.push(`/loja/${params.slug}`)
  }

  const saveBirthDate = async () => {
    if (!store || !token || !birthDate) return
    setSavingBirth(true)
    const { error: rpcError } = await supabase.rpc('upsert_customer_profile', { p_establishment_id: store.id, p_phone: phone, p_name: null, p_birth_date: birthDate, p_token: token })
    setSavingBirth(false)
    if (rpcError) toast.error('Não foi possível salvar a data agora.')
    else toast.success('Aniversário salvo. O desconto vale para datas cadastradas há pelo menos 30 dias.')
  }

  const deleteMyData = async () => {
    if (!store || !token) return
    const ok = await confirmDialog({
      title: 'Apagar seus dados nesta loja?',
      message: 'Apaga nome, endereços, aniversário e pontos. Os pedidos já feitos continuam no registro da loja.',
      confirmLabel: 'Apagar meus dados',
      danger: true,
    })
    if (!ok) return
    const { error: rpcError } = await supabase.rpc('delete_customer_data', { p_establishment_id: store.id, p_phone: phone, p_token: token })
    if (rpcError) {
      toast.error('Não foi possível apagar agora.')
      return
    }
    clearCustomerToken(store.id, phone)
    setToken(null)
    setOrders(null)
    toast.success('Seus dados foram apagados.')
  }

  if (loadingStore) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 size={32} className="animate-spin text-primary-500" /></div>
  }
  if (!store) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 text-center"><p className="text-gray-600">Loja não encontrada.</p></div>
  }

  return (
    <div className="min-h-screen bg-gray-50" style={themeStyle}>
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link href={`/loja/${params.slug}`} className="p-2 -ml-2 rounded-lg hover:bg-gray-100" aria-label="Voltar ao cardápio"><ArrowLeft size={20} /></Link>
          <div>
            <h1 className="font-display text-lg font-extrabold text-gray-900">Meus pedidos</h1>
            <p className="text-xs text-gray-500">{store.name}</p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <form
          onSubmit={(e) => { e.preventDefault(); setNeedsVerify(false); search(phone) }}
          className="bg-white rounded-2xl border border-gray-100 p-4"
        >
          <label htmlFor="mp-phone" className="block text-sm font-medium text-gray-700 mb-1.5">Seu WhatsApp</label>
          <div className="flex gap-2">
            <input id="mp-phone" type="tel" inputMode="tel" autoComplete="tel-national" className="input-field" value={phone} onChange={(e) => setPhone(formatPhoneNumber(e.target.value))} placeholder="(11) 99999-8888" />
            <button type="submit" disabled={searching || phone.replace(/\D/g, '').length < 10} className="btn-primary px-4 flex-shrink-0">
              {searching ? <Loader2 size={18} className="animate-spin" /> : 'Ver'}
            </button>
          </div>
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </form>

        {needsVerify && (
          <VerifyPhone establishmentId={store.id} phone={phone} onVerified={() => { setNeedsVerify(false); search(phone) }} />
        )}

        {orders && orders.length === 0 && (
          <div className="text-center py-10">
            <ShoppingBag size={40} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600">Você ainda não fez pedidos aqui.</p>
            <Link href={`/loja/${params.slug}`} className="btn-primary mt-4 inline-flex">Ver cardápio</Link>
          </div>
        )}

        {orders && orders.length > 0 && (
          <div className="space-y-3">
            {orders.map((order) => (
              <div key={order.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status]}`}>{STATUS_LABELS[order.status]}</span>
                  <span className="text-xs text-gray-500">{new Date(order.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p className="text-sm text-gray-800 mt-2 line-clamp-2">{order.items.map((i) => `${i.quantity}x ${i.product_name}`).join(', ')}</p>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-sm text-gray-500 flex items-center gap-1">
                    {order.order_type === 'delivery' ? <Bike size={14} /> : <Store size={14} />}
                    <strong className="text-gray-900 tabular-nums">{formatBRL(Number(order.total))}</strong>
                  </span>
                  <div className="flex gap-2">
                    <Link href={`/pedido/${order.id}`} className="btn-secondary text-xs py-1.5 px-3">Detalhes <ChevronRight size={13} /></Link>
                    {order.source !== 'balcao' && (
                      <button onClick={() => reorder(order)} className="btn-primary text-xs py-1.5 px-3"><RotateCcw size={13} /> Pedir de novo</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {token && orders && Number(store.birthday_discount_percent) > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="font-semibold text-gray-900 flex items-center gap-1.5"><Cake size={16} className="text-primary-600" /> Ganhe {store.birthday_discount_percent}% no seu aniversário</p>
            <p className="text-xs text-gray-500 mt-0.5">O desconto entra sozinho no pedido do dia, para datas cadastradas há pelo menos 30 dias.</p>
            <div className="flex gap-2 mt-3">
              <input type="date" className="input-field" value={birthDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setBirthDate(e.target.value)} aria-label="Data de nascimento" />
              <button onClick={saveBirthDate} disabled={savingBirth || !birthDate} className="btn-secondary px-4 flex-shrink-0">{savingBirth ? <Loader2 size={16} className="animate-spin" /> : 'Salvar'}</button>
            </div>
          </div>
        )}

        {token && orders && (
          <button onClick={deleteMyData} className="w-full flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-red-600 py-3">
            <Trash2 size={15} /> Apagar meus dados nesta loja
          </button>
        )}
      </main>
    </div>
  )
}
