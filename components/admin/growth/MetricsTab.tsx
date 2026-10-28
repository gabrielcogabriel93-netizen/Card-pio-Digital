'use client'

import { useCallback, useEffect, useState } from 'react'
import type { GrowthMetrics, LeadFlag } from '@/lib/growthMetrics'
import { AREA_LABELS, BENCHMARKS, type Insight } from '@/lib/growthInsights'
import { STAGE_LABELS } from '@/lib/growthStage'
import { Stat, Section, toneFor, num, pctText, brl, api } from './ui'
import { AlertTriangle, CheckCircle2, Info, Loader2, Sparkles, XCircle, ArrowRight, RefreshCw } from 'lucide-react'

interface Payload {
  metrics: GrowthMetrics
  insights: { items: Insight[]; bottleneck: Insight | null }
  billingEnabled: boolean
}

const SEV = {
  critico: { icon: XCircle, cls: 'border-red-200 bg-red-50', icls: 'text-red-600', label: 'Crítico' },
  atencao: { icon: AlertTriangle, cls: 'border-amber-200 bg-amber-50', icls: 'text-amber-600', label: 'Atenção' },
  info: { icon: Info, cls: 'border-blue-100 bg-blue-50', icls: 'text-blue-600', label: 'Info' },
  bom: { icon: CheckCircle2, cls: 'border-green-200 bg-green-50', icls: 'text-green-600', label: 'Bom' },
} as const

const ref = (v: number | string, suffix = '%') => `Referência: ${v}${suffix}`

export function MetricsTab({ onOpenLeads }: { onOpenLeads: (flag: LeadFlag) => void }) {
  const [period, setPeriod] = useState(30)
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [ai, setAi] = useState<{ text: string; provider: string } | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await api<Payload>(`/api/admin/growth/metrics?period=${period}`))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    load()
  }, [load])

  const askAi = async () => {
    setAiLoading(true)
    setAiError(null)
    try {
      setAi(await api('/api/admin/growth/ai', { method: 'POST' }))
    } catch (err: any) {
      setAiError(err.message)
    } finally {
      setAiLoading(false)
    }
  }

  if (loading && !data) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary-500" /></div>
  if (error && !data) return <div className="card text-sm text-red-600">{error} <button onClick={load} className="underline ml-2">Tentar de novo</button></div>
  if (!data) return null
  const { metrics: m, insights } = data
  const a = m.acquisition, act = m.activation, e = m.engagement, r = m.retention, rev = m.revenue, c = m.conversion, s = m.satisfaction

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {[7, 30, 90].map((p) => (
          <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${period === p ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
            Últimos {p} dias
          </button>
        ))}
        <button onClick={load} className="btn-secondary text-sm py-1.5 ml-auto" disabled={loading}>
          {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Atualizar
        </button>
      </div>

      {/* Parecer */}
      <Section title="Parecer do sistema" subtitle="Calculado agora a partir dos números abaixo. Os itens mais graves vêm primeiro.">
        {insights.bottleneck && (
          <div className="rounded-xl border-2 border-primary-200 bg-primary-50/60 p-4 mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Principal gargalo agora · {AREA_LABELS[insights.bottleneck.area]}</p>
            <p className="font-semibold text-gray-900 mt-1">{insights.bottleneck.title}</p>
            <p className="text-sm text-gray-700 mt-1">{insights.bottleneck.detail}</p>
            <p className="text-sm text-gray-900 mt-2"><strong>O que fazer:</strong> {insights.bottleneck.action}</p>
          </div>
        )}
        {insights.items.length === 0 ? (
          <p className="text-sm text-gray-500">Nada fora do normal no período.</p>
        ) : (
          <ul className="grid md:grid-cols-2 gap-2">
            {insights.items.map((i, idx) => {
              const sev = SEV[i.severity]
              const Icon = sev.icon
              return (
                <li key={idx} className={`rounded-xl border p-3 ${sev.cls}`}>
                  <div className="flex items-start gap-2">
                    <Icon size={18} className={`${sev.icls} flex-shrink-0 mt-0.5`} />
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-wide text-gray-500">{AREA_LABELS[i.area]}</p>
                      <p className="font-medium text-gray-900 text-sm">{i.title}</p>
                      <p className="text-xs text-gray-700 mt-0.5">{i.detail}</p>
                      <p className="text-xs text-gray-900 mt-1">{i.action}</p>
                      {i.filter && (
                        <button onClick={() => onOpenLeads(i.filter!)} className="text-xs font-semibold text-primary-700 mt-1.5 inline-flex items-center gap-1">
                          Ver contatos <ArrowRight size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <div className="mt-4 border-t border-gray-100 pt-3">
          <button onClick={askAi} disabled={aiLoading} className="btn-secondary text-sm">
            {aiLoading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Pedir parecer escrito por IA
          </button>
          {aiError && <p className="text-xs text-amber-700 mt-2">{aiError}</p>}
          {ai && (
            <div className="mt-3 rounded-xl bg-gray-50 p-4 text-sm text-gray-800 whitespace-pre-line">
              <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Parecer por IA ({ai.provider === 'claude' ? 'Claude' : 'Gemini'}) · últimos 30 dias</p>
              {ai.text}
            </div>
          )}
        </div>
      </Section>

      {/* 1. Aquisição */}
      <Section title="1. Aquisição" subtitle="Visitantes, cadastros e custo para conquistar cada cliente.">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label="Visitantes únicos" value={num(a.visitors)} hint="Site, cadastro e planos" />
          <Stat label="Começaram o cadastro" value={num(a.leads)} hint={`Visitante → cadastro: ${pctText(a.visitorToLead)}`} tone={a.visitors >= 50 ? toneFor(a.visitorToLead, BENCHMARKS.visitorToLead) : undefined} />
          <Stat label="Lojas criadas" value={num(a.stores)} hint={`Cadastro → loja: ${pctText(a.leadToStore)} · ${ref(BENCHMARKS.leadToStore)}`} tone={a.leads >= 5 ? toneFor(a.leadToStore, BENCHMARKS.leadToStore) : undefined} />
          <Stat label="Novos assinantes" value={num(a.newPaying)} />
          <Stat label="Investido em divulgação" value={brl(a.spend)} hint="Lançado em Investimento" />
          <Stat label="CAC (por assinante)" value={brl(a.cac)} hint="Investimento ÷ novos assinantes" />
          <Stat label="Custo por loja criada" value={brl(a.costPerStore)} />
          <Stat label="Visitante → loja" value={pctText(a.visitorToStore)} />
        </div>
        {a.sources.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead><tr className="text-left text-xs text-gray-500 border-b"><th className="py-2">Origem</th><th>Visitantes</th><th>Cadastros</th><th>Lojas</th><th>Assinantes</th></tr></thead>
              <tbody>
                {a.sources.map((row) => (
                  <tr key={row.source} className="border-b border-gray-50"><td className="py-1.5 font-medium">{row.source}</td><td>{num(row.visitors)}</td><td>{num(row.leads)}</td><td>{num(row.stores)}</td><td>{num(row.paying)}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-gray-500 mt-2">Para saber a origem de cada campanha, use links como <code>{typeof window !== 'undefined' ? window.location.host : ''}/?utm_source=instagram&amp;utm_campaign=reels-outubro</code>.</p>
          </div>
        )}
      </Section>

      {/* 2. Ativação */}
      <Section title="2. Ativação" subtitle={`Lojas criadas nos últimos ${m.periodDays} dias (${act.cohort}) e quanto chegaram ao primeiro valor.`}>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <Stat label="Concluíram a configuração" value={pctText(act.onboarding)} />
          <Stat label="Montaram o cardápio" value={pctText(act.products)} hint={ref(BENCHMARKS.products)} tone={act.cohort >= 3 ? toneFor(act.products, BENCHMARKS.products) : undefined} />
          <Stat label="Receberam o 1º pedido" value={pctText(act.firstOrder)} hint={ref(BENCHMARKS.firstOrder)} tone={act.cohort >= 3 ? toneFor(act.firstOrder, BENCHMARKS.firstOrder) : undefined} />
          <Stat label="1º pedido em até 7 dias" value={pctText(act.firstOrderIn7d)} />
          <Stat label="Tempo até o 1º pedido" value={act.medianDaysToFirstOrder == null ? '—' : `${act.medianDaysToFirstOrder.toLocaleString('pt-BR')} dias`} hint="Mediana" />
        </div>
        <div className="mt-4 space-y-1.5">
          <p className="text-xs text-gray-500">Onde está cada contato hoje (todos os tempos)</p>
          {act.funnel.map((f) => {
            const max = Math.max(1, ...act.funnel.map((x) => x.count))
            return (
              <div key={f.stage} className="flex items-center gap-2 text-sm">
                <span className="w-48 flex-shrink-0 text-gray-700 truncate">{STAGE_LABELS[f.stage]}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-primary-400" style={{ width: `${(f.count / max) * 100}%` }} /></div>
                <span className="w-10 text-right tabular-nums">{f.count}</span>
              </div>
            )
          })}
        </div>
      </Section>

      {/* 3. Engajamento */}
      <Section title="3. Engajamento" subtitle="Lojistas que abriram o painel (dias de uso) e movimento de pedidos.">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label="Ativos hoje (DAU)" value={num(e.dau)} />
          <Stat label="Ativos na semana (WAU)" value={num(e.wau)} />
          <Stat label="Ativos no mês (MAU)" value={num(e.mau)} hint={`de ${num(e.totalStores)} lojas`} />
          <Stat label="Uso diário / mensal" value={pctText(e.stickiness)} hint={ref(BENCHMARKS.stickiness)} tone={e.mau >= 5 ? toneFor(e.stickiness, BENCHMARKS.stickiness) : undefined} />
          <Stat label="Dias de uso por loja (30d)" value={e.avgActiveDays30 == null ? '—' : e.avgActiveDays30.toLocaleString('pt-BR')} />
          <Stat label="Lojas com pedido (7d)" value={num(e.storesWithOrders7d)} />
          <Stat label="Pedidos no período" value={num(e.platformOrders)} />
          <Stat label="Vendido pelas lojas" value={brl(e.gmv)} hint="Pedidos aceitos" />
        </div>
      </Section>

      {/* 4. Retenção */}
      <Section title="4. Retenção" subtitle="Quantas lojas continuam ativas meses depois do cadastro e cancelamentos.">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          <Stat label="Cancelamento ao mês" value={pctText(r.monthlyChurn)} hint={`Referência: até ${BENCHMARKS.monthlyChurn}%`} tone={toneFor(r.monthlyChurn, BENCHMARKS.monthlyChurn, true)} />
          <Stat label="Cancelaram no período" value={num(r.churned)} />
          <Stat label="Assinantes no início" value={num(r.payingAtStart)} />
          <Stat label="Assinantes sumidos" value={num(r.atRisk)} hint="Sem uso há 7+ dias" tone={r.atRisk > 0 ? 'warn' : undefined} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[420px]">
            <thead><tr className="text-left text-xs text-gray-500 border-b"><th className="py-2">Mês do cadastro</th><th>Lojas</th><th>Ativas no mês 1</th><th>Mês 2</th><th>Mês 3</th></tr></thead>
            <tbody>
              {r.cohorts.map((co) => (
                <tr key={co.month} className="border-b border-gray-50">
                  <td className="py-1.5 font-medium">{co.month.split('-').reverse().join('/')}</td>
                  <td>{co.size}</td>
                  {[co.m1, co.m2, co.m3].map((v, i) => <td key={i} className={v == null ? 'text-gray-300' : v >= 50 ? 'text-green-700' : v >= 30 ? 'text-amber-700' : 'text-red-600'}>{pctText(v)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-gray-500 mt-2">Ativa = recebeu pedido ou abriu o painel naquele mês.</p>
        </div>
      </Section>

      {/* 5. Receita */}
      <Section title="5. Receita" subtitle="Assinaturas ativas agora e receita do Pix automático.">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label="MRR (receita mensal)" value={brl(rev.mrr)} hint={`ARR ${brl(rev.arr)}`} />
          <Stat label="Assinantes pagando" value={num(rev.paying)} hint={`Essencial ${rev.payingEssencial} · Completo ${rev.payingCompleto}`} />
          <Stat label="ARPU (média por assinante)" value={brl(rev.arpu)} />
          <Stat label="LTV (valor no tempo de vida)" value={brl(rev.ltv)} hint={rev.ltvEstimated ? 'Estimado (24 meses) até haver cancelamentos registrados' : 'ARPU ÷ cancelamento mensal'} />
          <Stat label="Recebido de assinaturas" value={brl(rev.paidInPeriod)} hint="No período" />
          <Stat label="Taxa do Pix automático" value={brl(rev.pixRevenue)} hint="R$ 1,00 por pedido pago" />
        </div>
      </Section>

      {/* 6. Conversão */}
      <Section title="6. Conversão" subtitle="Testes que viram assinatura e quem desiste na hora de pagar.">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label="Teste → assinatura" value={pctText(c.trialToPaid)} hint={`${c.trialConverted} de ${c.trialEnded} testes encerrados (90 dias) · ${ref(BENCHMARKS.trialToPaid)}`} tone={c.trialEnded >= 5 ? toneFor(c.trialToPaid, BENCHMARKS.trialToPaid) : undefined} />
          <Stat label="Em teste agora" value={num(c.inTrial)} />
          <Stat label="Testes acabando em 7 dias" value={num(c.trialEndingIn7d)} tone={c.trialEndingIn7d > 0 ? 'warn' : undefined} />
          <Stat label="Abandono do pagamento" value={pctText(c.checkoutAbandonRate)} hint={`${c.checkoutAbandoned} de ${c.checkoutsStarted} · Referência: até ${BENCHMARKS.checkoutAbandon}%`} tone={c.checkoutsStarted >= 3 ? toneFor(c.checkoutAbandonRate, BENCHMARKS.checkoutAbandon, true) : undefined} />
        </div>
        {!data.billingEnabled && <p className="text-xs text-amber-700 mt-3">A cobrança da plataforma está desligada: os testes não têm prazo e a conversão não se aplica.</p>}
      </Section>

      {/* 7. Satisfação */}
      <Section title="7. Satisfação" subtitle="NPS dos lojistas (90 dias), nota dos clientes finais e chamados de suporte.">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label="NPS dos lojistas" value={s.nps == null ? '—' : s.nps} hint={`${s.npsResponses} respostas · ${s.promoters} promotores · ${s.detractors} detratores`} tone={s.nps == null ? undefined : s.nps >= BENCHMARKS.nps ? 'ok' : s.nps >= 0 ? 'warn' : 'bad'} />
          <Stat label="Nota dos clientes (CSAT)" value={s.csatAvg == null ? '—' : `${s.csatAvg.toLocaleString('pt-BR')} / 5`} hint={`${pctText(s.csatPositive)} deram 4 ou 5 · ${s.ratingsCount} avaliações`} tone={s.ratingsCount >= 10 ? toneFor(s.csatAvg, BENCHMARKS.csat) : undefined} />
          <Stat label="Chamados em aberto" value={num(s.ticketsOpen)} tone={s.ticketsOpen > 0 ? 'warn' : undefined} hint={`${s.ticketsInPeriod} abertos no período`} />
          <Stat label="Tempo médio de solução" value={s.avgResolutionHours == null ? '—' : `${s.avgResolutionHours.toLocaleString('pt-BR')} h`} />
        </div>
      </Section>

      <p className="text-[11px] text-gray-400">Atualizado em {new Date(m.generatedAt).toLocaleString('pt-BR')}. Visitas, uso do painel, NPS e pagamentos são registrados a partir desta versão; os números ficam mais precisos com o tempo.</p>
    </div>
  )
}
