'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { LeadFlag } from '@/lib/growthMetrics'
import { MetricsTab } from '@/components/admin/growth/MetricsTab'
import { LeadsTab } from '@/components/admin/growth/LeadsTab'
import { TicketsTab, NpsTab, SpendTab, TeamTab, AlertsTab } from '@/components/admin/growth/OtherTabs'
import { Loader2 } from 'lucide-react'

type Tab = 'painel' | 'contatos' | 'suporte' | 'satisfacao' | 'investimento' | 'equipe' | 'avisos'

const TABS: { id: Tab; label: string; ownerOnly?: boolean }[] = [
  { id: 'painel', label: 'Métricas e parecer' },
  { id: 'contatos', label: 'Contatos' },
  { id: 'suporte', label: 'Suporte' },
  { id: 'satisfacao', label: 'NPS' },
  { id: 'investimento', label: 'Investimento' },
  { id: 'equipe', label: 'Equipe', ownerOnly: true },
  { id: 'avisos', label: 'Avisos', ownerOnly: true },
]

/**
 * Crescimento do SaaS: métricas das 7 áreas com parecer automático, lista
 * de contatos com WhatsApp para a equipe, suporte, NPS, investimento,
 * equipe e avisos do dono (migration 057).
 */
function CrescimentoInner() {
  const router = useRouter()
  const params = useSearchParams()
  const [role, setRole] = useState<'dono' | 'crescimento' | null>(null)
  const [unread, setUnread] = useState(0)
  const tab = (TABS.find((t) => t.id === params.get('aba'))?.id || (params.get('lead') ? 'contatos' : 'painel')) as Tab
  const [flag, setFlag] = useState<LeadFlag | null>((params.get('filtro') as LeadFlag) || null)

  const refreshUnread = useCallback(() => {
    fetch('/api/admin/alerts').then((r) => (r.ok ? r.json() : null)).then((d) => setUnread(d?.unread || 0)).catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/admin/check').then((r) => r.json()).then((d) => {
      setRole(d.role === 'crescimento' ? 'crescimento' : 'dono')
      if (d.role !== 'crescimento') refreshUnread()
    }).catch(() => setRole('crescimento'))
  }, [refreshUnread])

  const go = (next: Tab, extra?: Record<string, string>) => {
    const q = new URLSearchParams({ aba: next, ...(extra || {}) })
    router.replace(`/admin/crescimento?${q}`, { scroll: false })
  }

  if (!role) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary-500" /></div>
  const visible = TABS.filter((t) => !t.ownerOnly || role === 'dono')

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      <div>
        <h1 className="page-title">Crescimento</h1>
        <p className="text-gray-600 mt-1">Onde o Freguês está travando, quem precisa de contato hoje e como cada área está evoluindo.</p>
      </div>

      <div className="flex gap-1 overflow-x-auto no-scrollbar border-b border-gray-200" role="tablist">
        {visible.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => go(t.id)}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${tab === t.id ? 'border-primary-500 text-primary-700' : 'border-transparent text-gray-600 hover:text-gray-900'}`}
          >
            {t.label}
            {t.id === 'avisos' && unread > 0 && <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full bg-primary-500 text-white">{unread}</span>}
          </button>
        ))}
      </div>

      {tab === 'painel' && <MetricsTab onOpenLeads={(f) => { setFlag(f); go('contatos', { filtro: f }) }} />}
      {tab === 'contatos' && <LeadsTab initialFlag={flag} initialLead={params.get('lead')} />}
      {tab === 'suporte' && <TicketsTab />}
      {tab === 'satisfacao' && <NpsTab />}
      {tab === 'investimento' && <SpendTab />}
      {tab === 'equipe' && role === 'dono' && <TeamTab />}
      {tab === 'avisos' && role === 'dono' && <AlertsTab onRead={refreshUnread} />}
    </div>
  )
}

export default function CrescimentoPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary-500" /></div>}>
      <CrescimentoInner />
    </Suspense>
  )
}
