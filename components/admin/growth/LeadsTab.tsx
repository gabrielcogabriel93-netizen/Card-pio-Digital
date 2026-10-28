'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { FLAG_LABELS, type LeadFlag } from '@/lib/growthMetrics'
import { STAGE_LABELS, STAGE_ORDER, stageMessage, type GrowthStage } from '@/lib/growthStage'
import { formatWhatsapp, whatsappLink } from '@/lib/whatsapp'
import { toast } from '@/components/Feedback'
import { api, brl, dateBR, dateTimeBR } from './ui'
import { Loader2, MessageCircle, Search, X, Phone, StickyNote, Mail, CalendarClock } from 'lucide-react'

interface Lead {
  id: string
  created_at: string
  name: string | null
  email: string | null
  whatsapp: string | null
  store_name: string | null
  store_id: string | null
  store_created_at: string | null
  plan_tier: string | null
  stage: GrowthStage
  flags: LeadFlag[]
  source: string
  utm_campaign: string | null
  crm_status: string
  assigned_to: string | null
  next_follow_up: string | null
  last_contact_at: string | null
  trial_days_left: number | null
  products: number | null
  orders_total: number | null
  orders_30d: number | null
  sales_30d: number | null
  last_activity_day: string | null
  push_devices: number | null
  last_note: { body: string; created_at: string } | null
}

interface Note { id: string; author_email: string; kind: string; body: string; created_at: string }

export const CRM_STATUS: Record<string, string> = {
  novo: 'Novo',
  contatado: 'Contatado',
  sem_resposta: 'Sem resposta',
  interessado: 'Interessado',
  convertido: 'Convertido',
  perdido: 'Perdido',
}

const STAGE_COLOR: Record<GrowthStage, string> = {
  iniciou: 'bg-gray-100 text-gray-700',
  conta_criada: 'bg-gray-100 text-gray-700',
  loja_criada: 'bg-amber-50 text-amber-800',
  cardapio: 'bg-blue-50 text-blue-800',
  primeiro_pedido: 'bg-teal-50 text-teal-800',
  assinante: 'bg-green-50 text-green-800',
  teste_vencido: 'bg-red-50 text-red-700',
  cancelado: 'bg-red-50 text-red-700',
}

const KIND_LABEL: Record<string, string> = { whatsapp: 'WhatsApp', ligacao: 'Ligação', email: 'E-mail', nota: 'Anotação' }
const SENDER_KEY = 'fregues_growth_sender'

export function LeadsTab({ initialFlag, initialLead }: { initialFlag?: LeadFlag | null; initialLead?: string | null }) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [me, setMe] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [flag, setFlag] = useState<LeadFlag | ''>(initialFlag || '')
  const [stage, setStage] = useState<GrowthStage | ''>('')
  const [status, setStatus] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)
  const [openId, setOpenId] = useState<string | null>(initialLead || null)
  const [sender, setSender] = useState('')

  const load = useCallback(async () => {
    setError(null)
    try {
      const data = await api<{ leads: Lead[]; me: string }>('/api/admin/growth/leads')
      setLeads(data.leads)
      setMe(data.me)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    try {
      setSender(localStorage.getItem(SENDER_KEY) || '')
    } catch {
      // sem storage
    }
  }, [load])

  useEffect(() => {
    if (initialFlag) setFlag(initialFlag)
  }, [initialFlag])

  const flagCounts = useMemo(() => {
    const c: Partial<Record<LeadFlag, number>> = {}
    for (const l of leads) for (const f of l.flags) c[f] = (c[f] || 0) + 1
    return c
  }, [leads])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    const digits = term.replace(/\D/g, '')
    return leads.filter((l) => {
      if (flag && !l.flags.includes(flag)) return false
      if (stage && l.stage !== stage) return false
      if (status && l.crm_status !== status) return false
      if (onlyMine && l.assigned_to !== me) return false
      if (!term) return true
      return [l.name, l.email, l.store_name].some((v) => v?.toLowerCase().includes(term)) || (!!digits && !!l.whatsapp?.includes(digits))
    })
  }, [leads, q, flag, stage, status, onlyMine, me])

  const patch = async (id: string, body: Record<string, unknown>) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...body } as Lead : l)))
    try {
      await api('/api/admin/growth/leads', { method: 'PATCH', body: JSON.stringify({ id, ...body }) })
    } catch (err: any) {
      toast.error(err.message)
      load()
    }
  }

  const messageFor = (l: Lead) => stageMessage(l.stage, { name: l.name, storeName: l.store_name, trialDaysLeft: l.trial_days_left, senderName: sender || null })

  const openWhatsapp = async (l: Lead) => {
    const link = whatsappLink(l.whatsapp, messageFor(l))
    if (!link) {
      toast.error('Este contato não tem WhatsApp.')
      return
    }
    window.open(link, '_blank', 'noopener')
    try {
      await api(`/api/admin/growth/leads/${l.id}/notes`, { method: 'POST', body: JSON.stringify({ kind: 'whatsapp', body: `Mensagem enviada pelo WhatsApp (${STAGE_LABELS[l.stage]}).` }) })
      setLeads((prev) => prev.map((x) => (x.id === l.id ? { ...x, crm_status: x.crm_status === 'novo' ? 'contatado' : x.crm_status, last_contact_at: new Date().toISOString() } : x)))
    } catch {
      // o WhatsApp já abriu; o registro é complementar
    }
  }

  const open = leads.find((l) => l.id === openId) || null

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary-500" /></div>
  if (error) return <div className="card text-sm text-red-600">{error} <button onClick={load} className="underline ml-2">Tentar de novo</button></div>

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFlag('')} className={`px-3 py-1.5 rounded-full text-xs font-medium ${!flag ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-700'}`}>Todos ({leads.length})</button>
          {(Object.keys(FLAG_LABELS) as LeadFlag[]).map((f) => (
            <button key={f} onClick={() => setFlag(f)} className={`px-3 py-1.5 rounded-full text-xs font-medium ${flag === f ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-700'}`}>
              {FLAG_LABELS[f]} ({flagCounts[f] || 0})
            </button>
          ))}
        </div>
        <div className="grid sm:grid-cols-4 gap-2">
          <label className="relative sm:col-span-2">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input-field pl-9 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, loja, e-mail ou WhatsApp" aria-label="Buscar contato" />
          </label>
          <select className="input-field text-sm" value={stage} onChange={(e) => setStage(e.target.value as GrowthStage | '')} aria-label="Etapa">
            <option value="">Todas as etapas</option>
            {STAGE_ORDER.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
          </select>
          <select className="input-field text-sm" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status do contato">
            <option value="">Todos os status</option>
            {Object.entries(CRM_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> Só os meus</label>
          <label className="flex items-center gap-2 ml-auto">
            <span className="text-gray-500 text-xs">Seu nome nas mensagens</span>
            <input className="input-field text-sm py-1 w-36" value={sender} onChange={(e) => { setSender(e.target.value); try { localStorage.setItem(SENDER_KEY, e.target.value) } catch { /* ignora */ } }} placeholder="Ex.: Lucas" />
          </label>
        </div>
      </div>

      <p className="text-xs text-gray-500">{filtered.length} contato(s)</p>
      <ul className="space-y-2">
        {filtered.slice(0, 300).map((l) => (
          <li key={l.id} className="card p-3">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <button onClick={() => setOpenId(l.id)} className="flex-1 min-w-0 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-gray-900 truncate">{l.name || 'Sem nome'}</p>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${STAGE_COLOR[l.stage]}`}>{STAGE_LABELS[l.stage]}</span>
                  {l.flags.map((f) => <span key={f} className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">{FLAG_LABELS[f]}</span>)}
                </div>
                <p className="text-sm text-gray-600 truncate">
                  {l.store_name || 'Sem loja'} · {formatWhatsapp(l.whatsapp) || 'sem WhatsApp'} · via {l.source}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Desde {dateBR(l.created_at)}
                  {l.trial_days_left != null && l.stage !== 'assinante' ? ` · teste: ${l.trial_days_left < 0 ? 'vencido' : `${l.trial_days_left} dia(s)`}` : ''}
                  {l.orders_30d != null ? ` · ${l.orders_30d} pedidos em 30d` : ''}
                  {l.next_follow_up ? ` · retornar ${dateBR(l.next_follow_up)}` : ''}
                </p>
                {l.last_note && <p className="text-xs text-gray-500 mt-1 truncate">Último registro: {l.last_note.body}</p>}
              </button>
              <div className="flex items-center gap-2 flex-shrink-0">
                <select className="input-field text-sm py-1.5 w-36" value={l.crm_status} onChange={(e) => patch(l.id, { crm_status: e.target.value })} aria-label="Status">
                  {Object.entries(CRM_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <button onClick={() => openWhatsapp(l)} disabled={!l.whatsapp} className="btn-primary text-sm py-1.5" title="Abre o WhatsApp com a mensagem pronta para esta etapa">
                  <MessageCircle size={15} /> WhatsApp
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {filtered.length > 300 && <p className="text-xs text-gray-500">Mostrando 300. Use os filtros para achar os demais.</p>}

      {open && <LeadDrawer lead={open} me={me} message={messageFor(open)} onClose={() => setOpenId(null)} onPatch={(b) => patch(open.id, b)} onWhatsapp={() => openWhatsapp(open)} onNote={load} />}
    </div>
  )
}

function LeadDrawer({ lead, me, message, onClose, onPatch, onWhatsapp, onNote }: {
  lead: Lead
  me: string
  message: string
  onClose: () => void
  onPatch: (b: Record<string, unknown>) => void
  onWhatsapp: () => void
  onNote: () => void
}) {
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [kind, setKind] = useState('ligacao')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  const loadNotes = useCallback(async () => {
    try {
      setNotes((await api<{ notes: Note[] }>(`/api/admin/growth/leads/${lead.id}/notes`)).notes)
    } catch {
      setNotes([])
    }
  }, [lead.id])

  useEffect(() => {
    loadNotes()
  }, [loadNotes])

  const save = async () => {
    if (!body.trim()) return
    setSaving(true)
    try {
      await api(`/api/admin/growth/leads/${lead.id}/notes`, { method: 'POST', body: JSON.stringify({ kind, body }) })
      setBody('')
      await loadNotes()
      onNote()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative w-full max-w-lg h-full bg-white overflow-y-auto p-5 space-y-4" role="dialog" aria-label={`Contato ${lead.name || ''}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-gray-900 truncate">{lead.name || 'Sem nome'}</h3>
            <p className="text-sm text-gray-600">{lead.store_name || 'Sem loja'} · {STAGE_LABELS[lead.stage]}</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400" aria-label="Fechar"><X size={20} /></button>
        </div>

        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div><dt className="text-xs text-gray-500">WhatsApp</dt><dd className="font-medium">{formatWhatsapp(lead.whatsapp) || '—'}</dd></div>
          <div className="min-w-0"><dt className="text-xs text-gray-500">E-mail</dt><dd className="font-medium truncate">{lead.email || '—'}</dd></div>
          <div><dt className="text-xs text-gray-500">Origem</dt><dd>{lead.source}{lead.utm_campaign ? ` · ${lead.utm_campaign}` : ''}</dd></div>
          <div><dt className="text-xs text-gray-500">Cadastro</dt><dd>{dateTimeBR(lead.created_at)}</dd></div>
          <div><dt className="text-xs text-gray-500">Produtos</dt><dd>{lead.products ?? '—'}</dd></div>
          <div><dt className="text-xs text-gray-500">Pedidos (total · 30d)</dt><dd>{lead.orders_total ?? '—'} · {lead.orders_30d ?? '—'}</dd></div>
          <div><dt className="text-xs text-gray-500">Vendido em 30d</dt><dd>{brl(lead.sales_30d)}</dd></div>
          <div><dt className="text-xs text-gray-500">Último uso do painel</dt><dd>{dateBR(lead.last_activity_day)}</dd></div>
          <div><dt className="text-xs text-gray-500">Plano</dt><dd>{lead.plan_tier === 'completo' ? 'Completo' : lead.store_id ? 'Essencial' : '—'}</dd></div>
          <div><dt className="text-xs text-gray-500">Clientes com o app</dt><dd>{lead.push_devices ?? '—'}</dd></div>
        </dl>

        <div className="rounded-xl bg-gray-50 p-3">
          <p className="text-xs text-gray-500 mb-1">Mensagem sugerida para esta etapa</p>
          <p className="text-sm text-gray-800">{message}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button onClick={onWhatsapp} disabled={!lead.whatsapp} className="btn-primary text-sm"><MessageCircle size={15} /> Abrir no WhatsApp</button>
            {lead.whatsapp && <a href={`tel:+${lead.whatsapp}`} className="btn-secondary text-sm"><Phone size={15} /> Ligar</a>}
            {lead.email && <a href={`mailto:${lead.email}`} className="btn-secondary text-sm"><Mail size={15} /> E-mail</a>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">
            <span className="block text-xs text-gray-500 mb-1">Status</span>
            <select className="input-field text-sm" value={lead.crm_status} onChange={(e) => onPatch({ crm_status: e.target.value })}>
              {Object.entries(CRM_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-xs text-gray-500 mb-1 flex items-center gap-1"><CalendarClock size={12} /> Próximo contato</span>
            <input type="date" className="input-field text-sm" value={lead.next_follow_up || ''} onChange={(e) => onPatch({ next_follow_up: e.target.value || null })} />
          </label>
          <label className="text-sm col-span-2">
            <span className="block text-xs text-gray-500 mb-1">Responsável</span>
            <div className="flex gap-2">
              <input
                key={lead.assigned_to || ''}
                className="input-field text-sm"
                defaultValue={lead.assigned_to || ''}
                onBlur={(e) => { if ((e.target.value || null) !== (lead.assigned_to || null)) onPatch({ assigned_to: e.target.value.trim() || null }) }}
                placeholder="e-mail de quem cuida"
              />
              <button onClick={() => onPatch({ assigned_to: me })} className="btn-secondary text-sm whitespace-nowrap">Assumir</button>
            </div>
          </label>
        </div>

        <div>
          <p className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-1"><StickyNote size={15} /> Registrar contato</p>
          <div className="flex gap-2 mb-2">
            {Object.entries(KIND_LABEL).map(([k, v]) => (
              <button key={k} onClick={() => setKind(k)} className={`px-2.5 py-1 rounded-lg text-xs ${kind === k ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-700'}`}>{v}</button>
            ))}
          </div>
          <textarea className="input-field text-sm" rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="O que foi conversado, próximos passos…" />
          <button onClick={save} disabled={saving || !body.trim()} className="btn-primary text-sm mt-2">{saving ? <Loader2 size={15} className="animate-spin" /> : 'Salvar registro'}</button>
        </div>

        <div>
          <p className="text-sm font-semibold text-gray-900 mb-2">Histórico</p>
          {notes == null ? <Loader2 className="animate-spin text-primary-500" size={18} /> : notes.length === 0 ? <p className="text-sm text-gray-500">Nenhum registro ainda.</p> : (
            <ul className="space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="rounded-lg border border-gray-100 p-2 text-sm">
                  <p className="text-xs text-gray-500">{KIND_LABEL[n.kind] || n.kind} · {n.author_email} · {dateTimeBR(n.created_at)}</p>
                  <p className="text-gray-800 whitespace-pre-line mt-0.5">{n.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  )
}
