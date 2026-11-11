'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { PromoSuggestion } from '@/lib/promoStrategist'
import { toast, confirmDialog } from '@/components/Feedback'
import { BadgePercent, CalendarHeart, CheckCircle2, Lightbulb, Loader2, RefreshCw, Sparkles, TrendingUp, XCircle } from 'lucide-react'

interface Applied {
  id: string
  kind: string
  title: string
  explanation: string | null
  status: 'ativa' | 'encerrada'
  starts_at: string
  ends_at: string | null
  payload: { summary?: string; howToPromote?: string }
}

const KIND_LABEL: Record<string, string> = { preco: 'Oferta de preço', combo: 'Combo', cupom: 'Cupom', frete: 'Entrega grátis' }

/**
 * Sugestões de promoções: o estrategista olha os produtos, as vendas e a
 * operação, sugere ofertas da semana com a conta de por que dão lucro e
 * aplica com um toque (preço, combo, cupom ou frete + banner no cardápio).
 */
export default function PromocoesPage() {
  const [suggestions, setSuggestions] = useState<PromoSuggestion[]>([])
  const [applied, setApplied] = useState<Applied[]>([])
  const [orders30, setOrders30] = useState(0)
  const [shown, setShown] = useState(3)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/promotions')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar.')
      setSuggestions(data.suggestions || [])
      setApplied(data.promotions || [])
      setOrders30(data.orders30 || 0)
      setError(data.promotionsError ? 'Atualização do banco pendente (migration 060): dá para ver as sugestões, mas aplicar fica disponível depois.' : null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const apply = async (s: PromoSuggestion) => {
    if (!(await confirmDialog(`Aplicar "${s.title}"? Ela entra no cardápio agora${s.banner.title ? ', com banner no topo' : ''}.`))) return
    setBusy(s.key)
    try {
      const res = await fetch('/api/promotions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: s.key }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Não foi possível aplicar.')
      toast.success('Promoção no ar! ' + (data.howToPromote || ''))
      await load()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setBusy(null)
    }
  }

  const end = async (a: Applied) => {
    if (!(await confirmDialog(`Encerrar "${a.title}"? O cardápio volta ao normal e o banner sai.`))) return
    setBusy(a.id)
    const res = await fetch('/api/promotions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id }) })
    setBusy(null)
    if (!res.ok) toast.error('Não foi possível encerrar.')
    load()
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary-500" /></div>

  const active = applied.filter((a) => a.status === 'ativa' && (!a.ends_at || new Date(a.ends_at) > new Date()))
  const past = applied.filter((a) => !active.includes(a)).slice(0, 10)
  const visible = suggestions.slice(0, shown)

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="page-title flex items-center gap-2"><BadgePercent size={24} className="text-primary-600" /> Sugestões de promoções</h1>
        <p className="text-gray-600 mt-1">Toda semana, ofertas pensadas a partir dos seus produtos e das suas vendas, com a conta de por que cada uma dá lucro. Gostou? Aplique: ela entra no cardápio com banner no topo.</p>
        {orders30 < 5 && <p className="text-xs text-gray-500 mt-1">Ainda há poucos pedidos nos últimos 30 dias: as contas usam os seus preços e custos. Com mais vendas, as sugestões ficam mais certeiras.</p>}
      </div>

      {error && <p className="card text-sm text-amber-800 bg-amber-50 border border-amber-200">{error}</p>}

      {active.length > 0 && (
        <section className="card space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><TrendingUp size={18} className="text-green-600" /> No ar agora</h2>
          {active.map((a) => (
            <div key={a.id} className="rounded-xl border border-green-200 bg-green-50 p-3 flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-green-800">{KIND_LABEL[a.kind] || a.kind}</p>
                <p className="font-medium text-gray-900">{a.title}</p>
                <p className="text-xs text-gray-600">{a.ends_at ? `Até ${new Date(a.ends_at).toLocaleDateString('pt-BR')}` : 'Sem data de fim'}{a.payload?.howToPromote ? ` · ${a.payload.howToPromote}` : ''}</p>
              </div>
              <button onClick={() => end(a)} disabled={busy === a.id} className="btn-secondary text-sm"><XCircle size={15} /> Encerrar</button>
            </div>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><Sparkles size={18} className="text-primary-600" /> Sugestões da semana</h2>
          {suggestions.length > shown && (
            <button onClick={() => setShown((n) => n + 1)} className="btn-secondary text-sm"><RefreshCw size={15} /> Gerar nova promoção ou oferta</button>
          )}
        </div>
        {visible.length === 0 ? (
          <p className="card text-sm text-gray-500">Sem novas sugestões agora: você já aplicou as principais. Cadastre mais produtos (e o custo de cada prato) para receber outras ideias.</p>
        ) : visible.map((s) => (
          <article key={s.key} className="card space-y-3">
            <div>
              {s.occasion && (
                <p className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold px-2.5 py-0.5 mb-1.5">
                  <CalendarHeart size={13} /> {s.occasion.name} · {s.occasion.date.slice(8, 10)}/{s.occasion.date.slice(5, 7)} · {s.occasion.daysUntil === 0 ? 'é hoje' : s.occasion.daysUntil === 1 ? 'amanhã' : `em ${s.occasion.daysUntil} dias`}
                </p>
              )}
              <p className="text-[11px] uppercase tracking-wide text-primary-700 font-semibold">{KIND_LABEL[s.kind]} · {s.occasion ? `até ${s.occasion.date.slice(8, 10)}/${s.occasion.date.slice(5, 7)}` : `${s.durationDays} dias`}</p>
              <h3 className="text-lg font-bold text-gray-900">{s.title}</h3>
              <p className="text-sm text-gray-700 mt-0.5">{s.summary}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-1"><Lightbulb size={15} className="text-amber-500" /> Por que dá lucro</p>
              <ul className="space-y-1 text-sm text-gray-700 list-disc pl-5">
                {s.why.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
            <p className="text-sm text-gray-600"><strong>Como divulgar:</strong> {s.howToPromote}</p>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => apply(s)} disabled={busy === s.key || !!error} className="btn-primary">
                {busy === s.key ? <Loader2 size={16} className="animate-spin" /> : <><CheckCircle2 size={16} /> Aplicar no cardápio</>}
              </button>
              {s.banner.title && <span className="text-xs text-gray-500">Cria o banner “{s.banner.title}” no topo do cardápio.</span>}
            </div>
          </article>
        ))}
        <p className="text-xs text-gray-500">Para margens exatas, informe o <strong>custo do prato</strong> em <Link href="/painel/produtos" className="text-primary-600 underline">Produtos</Link>. Sem ele, a conta usa um custo de 35% do preço, comum em comida.</p>
      </section>

      {past.length > 0 && (
        <section className="card space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">Encerradas</h2>
          {past.map((a) => <p key={a.id} className="text-sm text-gray-500">{a.title} · {new Date(a.starts_at).toLocaleDateString('pt-BR')}</p>)}
        </section>
      )}
    </div>
  )
}
