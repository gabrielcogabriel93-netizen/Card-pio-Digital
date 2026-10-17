'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from '@/components/Feedback'
import { AlertOctagon, AlertTriangle, Info, Loader2, RefreshCw, Check, Monitor, Server } from 'lucide-react'

interface LogRow {
  id: string
  created_at: string
  level: 'critical' | 'error' | 'warning' | null
  source: 'servidor' | 'navegador' | null
  scope: string
  message: string
  detail: unknown
  url: string | null
  user_agent: string | null
  resolved_at: string | null
  establishment_id: string | null
  establishments: { name: string; slug: string } | null
}

const LEVEL_STYLE = {
  critical: { label: 'Crítico', className: 'bg-red-100 text-red-800', icon: AlertOctagon },
  error: { label: 'Erro', className: 'bg-amber-100 text-amber-800', icon: AlertTriangle },
  warning: { label: 'Aviso', className: 'bg-gray-100 text-gray-700', icon: Info },
} as const

const fmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Sao_Paulo' })

/**
 * Aba Logs: todo erro do app (rotas de servidor, webhooks, cron e
 * navegador de clientes e lojistas) registrado por lib/logger.ts.
 * Atualiza sozinha a cada 30s.
 */
export default function AdminLogsPage() {
  const [logs, setLogs] = useState<LogRow[]>([])
  const [summary, setSummary] = useState({ critical: 0, error: 0, warning: 0 })
  const [loading, setLoading] = useState(true)
  const [level, setLevel] = useState('')
  const [source, setSource] = useState('')
  const [hours, setHours] = useState(24)
  const [q, setQ] = useState('')
  const [showResolved, setShowResolved] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const params = new URLSearchParams({ hours: String(hours) })
    if (level) params.set('level', level)
    if (source) params.set('source', source)
    if (q.trim()) params.set('q', q.trim())
    if (showResolved) params.set('resolved', '1')
    try {
      const res = await fetch(`/api/admin/logs?${params}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar logs')
      setLogs(data.logs)
      setSummary(data.summary)
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [hours, level, source, q, showResolved])

  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [load])

  const resolve = async (body: { id?: string; scope?: string }) => {
    const res = await fetch('/api/admin/logs', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) {
      toast.success(body.scope ? `Todos de "${body.scope}" marcados como resolvidos` : 'Marcado como resolvido')
      load()
    } else {
      toast.error('Não foi possível marcar como resolvido.')
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Logs de erro</h1>
          <p className="text-gray-600 text-sm mt-1">Tudo que falhou no servidor e no navegador de clientes e lojistas. Atualiza a cada 30 segundos.</p>
        </div>
        <button onClick={() => { setLoading(true); load() }} className="btn-secondary text-sm"><RefreshCw size={15} /> Atualizar</button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {(['critical', 'error', 'warning'] as const).map((key) => {
          const S = LEVEL_STYLE[key]
          return (
            <button key={key} onClick={() => setLevel(level === key ? '' : key)} className={`card text-left py-4 ${level === key ? 'ring-2 ring-primary-400' : ''}`}>
              <p className="stat-value">{summary[key]}</p>
              <p className="text-sm text-gray-600 flex items-center gap-1.5"><S.icon size={14} /> {S.label}s abertos</p>
            </button>
          )
        })}
      </div>

      <div className="card flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label htmlFor="log-q" className="block text-xs text-gray-600 mb-1">Buscar</label>
          <input id="log-q" className="input-field text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mensagem ou escopo (ex: mercadopago)" />
        </div>
        <div>
          <label htmlFor="log-source" className="block text-xs text-gray-600 mb-1">Origem</label>
          <select id="log-source" className="input-field text-sm" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Todas</option>
            <option value="servidor">Servidor</option>
            <option value="navegador">Navegador</option>
          </select>
        </div>
        <div>
          <label htmlFor="log-hours" className="block text-xs text-gray-600 mb-1">Período</label>
          <select id="log-hours" className="input-field text-sm" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            <option value={1}>Última hora</option>
            <option value={24}>Últimas 24 h</option>
            <option value={168}>Últimos 7 dias</option>
            <option value={720}>Últimos 30 dias</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 pb-2.5">
          <input type="checkbox" className="rounded text-primary-500" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
          Mostrar resolvidos
        </label>
      </div>

      {error && <div className="bg-red-50 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary-500" /></div>
      ) : logs.length === 0 ? (
        <div className="card text-center py-14">
          <Check size={32} className="text-green-600 mx-auto mb-2" />
          <p className="font-semibold text-gray-900">Nenhum erro neste período</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const S = LEVEL_STYLE[(log.level || 'error') as keyof typeof LEVEL_STYLE] || LEVEL_STYLE.error
            const isOpen = open === log.id
            return (
              <div key={log.id} className={`bg-white rounded-xl border ${log.level === 'critical' ? 'border-red-200' : 'border-gray-100'} ${log.resolved_at ? 'opacity-60' : ''}`}>
                <button onClick={() => setOpen(isOpen ? null : log.id)} className="w-full text-left p-3 flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${S.className}`}>{S.label}</span>
                    <span className="text-xs text-gray-500 tabular-nums">{fmt.format(new Date(log.created_at))}</span>
                    {log.source === 'servidor' ? <Server size={13} className="text-gray-400" aria-label="Servidor" /> : <Monitor size={13} className="text-gray-400" aria-label="Navegador" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 truncate">{log.message}</p>
                    <p className="text-xs text-gray-500 font-mono truncate">{log.scope}{log.establishments ? ` · ${log.establishments.name}` : ''}</p>
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-gray-100 p-3 space-y-2 text-xs">
                    {log.url && <p className="text-gray-600 break-all"><strong>Página:</strong> {log.url}</p>}
                    {log.user_agent && <p className="text-gray-600 break-all"><strong>Navegador:</strong> {log.user_agent}</p>}
                    {log.establishments && <p className="text-gray-600"><strong>Loja:</strong> {log.establishments.name} (/loja/{log.establishments.slug})</p>}
                    <pre className="bg-gray-900 text-gray-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all max-h-80">{JSON.stringify(log.detail, null, 2)}</pre>
                    {!log.resolved_at && (
                      <div className="flex gap-2">
                        <button onClick={() => resolve({ id: log.id })} className="btn-secondary text-xs py-1.5">Marcar como resolvido</button>
                        <button onClick={() => resolve({ scope: log.scope })} className="btn-secondary text-xs py-1.5">Resolver todos deste escopo</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
