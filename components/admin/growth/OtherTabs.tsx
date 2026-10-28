'use client'

import { useCallback, useEffect, useState } from 'react'
import { formatWhatsapp, whatsappLink } from '@/lib/whatsapp'
import { enableOwnerAlerts, isPushSupported } from '@/lib/pushClient'
import { toast, confirmDialog } from '@/components/Feedback'
import { api, brl, dateTimeBR, Section } from './ui'
import { Loader2, MessageCircle, Trash2, Bell, BellRing, CheckCheck, UserPlus } from 'lucide-react'

function useLoad<T>(url: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      setData(await api<T>(url))
      setError(null)
    } catch (err: any) {
      setError(err.message)
    }
  }, [url])
  useEffect(() => {
    load()
  }, [load])
  return { data, error, load, setData }
}

const Spinner = () => <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary-500" /></div>

// ---------------- Suporte ----------------
interface Ticket {
  id: string
  subject: string
  message: string
  whatsapp: string | null
  status: 'aberto' | 'em_andamento' | 'resolvido'
  admin_reply: string | null
  created_at: string
  establishments: { name: string; slug: string } | null
}
const TICKET_STATUS = { aberto: 'Aberto', em_andamento: 'Em andamento', resolvido: 'Resolvido' }

export function TicketsTab() {
  const { data, error, load } = useLoad<{ tickets: Ticket[] }>('/api/admin/growth/tickets')
  const [filter, setFilter] = useState<'abertos' | 'todos'>('abertos')
  const [replies, setReplies] = useState<Record<string, string>>({})

  const save = async (t: Ticket, body: Record<string, unknown>) => {
    try {
      await api('/api/admin/growth/tickets', { method: 'PATCH', body: JSON.stringify({ id: t.id, ...body }) })
      toast.success('Chamado atualizado')
      load()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  if (error) return <div className="card text-sm text-red-600">{error}</div>
  if (!data) return <Spinner />
  const list = data.tickets.filter((t) => filter === 'todos' || t.status !== 'resolvido')

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(['abertos', 'todos'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-sm ${filter === f ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-700'}`}>{f === 'abertos' ? 'Em aberto' : 'Todos'}</button>
        ))}
      </div>
      {list.length === 0 && <p className="card text-sm text-gray-500">Nenhum chamado {filter === 'abertos' ? 'em aberto' : ''}.</p>}
      {list.map((t) => {
        const reply = replies[t.id] ?? t.admin_reply ?? ''
        const wa = whatsappLink(t.whatsapp, `Oi! Aqui é do Freguês, sobre o seu chamado "${t.subject}": `)
        return (
          <div key={t.id} className="card space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-gray-900">{t.establishments?.name || 'Loja'} · {t.subject}</p>
              <select className="input-field text-sm py-1 w-40" value={t.status} onChange={(e) => save(t, { status: e.target.value })} aria-label="Status do chamado">
                {Object.entries(TICKET_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-line">{t.message}</p>
            <p className="text-xs text-gray-400">{dateTimeBR(t.created_at)} · WhatsApp {formatWhatsapp(t.whatsapp) || '—'}</p>
            <textarea className="input-field text-sm" rows={2} value={reply} onChange={(e) => setReplies((r) => ({ ...r, [t.id]: e.target.value }))} placeholder="Resposta que o lojista vê na página Ajuda" />
            <div className="flex flex-wrap gap-2">
              <button onClick={() => save(t, { admin_reply: reply, status: t.status === 'aberto' ? 'em_andamento' : t.status })} className="btn-secondary text-sm">Salvar resposta</button>
              {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-primary text-sm"><MessageCircle size={15} /> Responder no WhatsApp</a>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------- Satisfação (NPS) ----------------
interface NpsRow { id: string; score: number; comment: string | null; created_at: string; establishments: { name: string; whatsapp_number: string | null } | null }

export function NpsTab() {
  const { data, error } = useLoad<{ responses: NpsRow[] }>('/api/admin/growth/nps')
  if (error) return <div className="card text-sm text-red-600">{error}</div>
  if (!data) return <Spinner />
  const tone = (s: number) => (s >= 9 ? 'bg-green-50 text-green-800' : s >= 7 ? 'bg-gray-100 text-gray-700' : 'bg-red-50 text-red-700')
  return (
    <Section title="Respostas de NPS" subtitle="Promotores (9-10), neutros (7-8) e detratores (0-6). Ligue para os detratores primeiro.">
      {data.responses.length === 0 ? <p className="text-sm text-gray-500">Ainda sem respostas. O painel pergunta para lojas com 14 dias ou mais.</p> : (
        <ul className="space-y-2">
          {data.responses.map((r) => {
            const wa = whatsappLink(r.establishments?.whatsapp_number, `Oi! Aqui é do Freguês. Obrigado pela nota ${r.score}. Posso entender melhor o que podemos melhorar?`)
            return (
              <li key={r.id} className="flex items-start gap-3 rounded-xl border border-gray-100 p-3">
                <span className={`text-lg font-bold w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${tone(r.score)}`}>{r.score}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm">{r.establishments?.name || 'Loja'}</p>
                  <p className="text-sm text-gray-700">{r.comment || <span className="text-gray-400">Sem comentário</span>}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{dateTimeBR(r.created_at)}</p>
                </div>
                {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-secondary text-sm py-1.5"><MessageCircle size={14} /></a>}
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}

// ---------------- Investimento ----------------
interface Spend { id: string; month: string; channel: string; amount: number; note: string | null; created_by: string | null }

export function SpendTab() {
  const { data, error, load } = useLoad<{ spend: Spend[] }>('/api/admin/growth/spend')
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [channel, setChannel] = useState('instagram')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api('/api/admin/growth/spend', { method: 'POST', body: JSON.stringify({ month, channel, amount, note }) })
      setAmount('')
      setNote('')
      load()
    } catch (err: any) {
      toast.error(err.message)
    }
  }
  const remove = async (id: string) => {
    if (!(await confirmDialog('Excluir este lançamento?'))) return
    await api(`/api/admin/growth/spend?id=${id}`, { method: 'DELETE' }).catch((err) => toast.error(err.message))
    load()
  }

  return (
    <Section title="Investimento em divulgação" subtitle="Anúncios, influenciadores, impressos. É a base do CAC (custo por cliente). Use o mesmo nome de canal do utm_source.">
      <form onSubmit={add} className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
        <input type="month" className="input-field text-sm" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mês" required />
        <input className="input-field text-sm" value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="Canal (instagram, google…)" aria-label="Canal" />
        <input className="input-field text-sm" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,.]/g, ''))} placeholder="Valor (R$)" aria-label="Valor" required />
        <input className="input-field text-sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observação" aria-label="Observação" />
        <button type="submit" className="btn-primary text-sm col-span-2 md:col-span-1">Lançar</button>
      </form>
      {error ? <p className="text-sm text-red-600">{error}</p> : !data ? <Spinner /> : data.spend.length === 0 ? <p className="text-sm text-gray-500">Nenhum investimento lançado.</p> : (
        <ul className="divide-y divide-gray-100">
          {data.spend.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="w-20 text-gray-500">{s.month.slice(5, 7)}/{s.month.slice(0, 4)}</span>
              <span className="flex-1 min-w-0 truncate"><strong>{s.channel}</strong>{s.note ? ` · ${s.note}` : ''}</span>
              <span className="tabular-nums">{brl(Number(s.amount))}</span>
              <button onClick={() => remove(s.id)} className="p-1 text-gray-300 hover:text-red-500" aria-label="Excluir"><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

// ---------------- Equipe (só dono) ----------------
interface Member { email: string; name: string | null; added_by: string | null; created_at: string }

export function TeamTab() {
  const { data, error, load } = useLoad<{ team: Member[] }>('/api/admin/growth/team')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api('/api/admin/growth/team', { method: 'POST', body: JSON.stringify({ email, name }) })
      toast.success('Acesso liberado. A pessoa entra com esse e-mail em /admin.')
      setEmail('')
      setName('')
      load()
    } catch (err: any) {
      toast.error(err.message)
    }
  }
  const remove = async (m: Member) => {
    if (!(await confirmDialog(`Remover o acesso de ${m.email}?`))) return
    await api(`/api/admin/growth/team?email=${encodeURIComponent(m.email)}`, { method: 'DELETE' }).catch((err) => toast.error(err.message))
    load()
  }

  return (
    <Section title="Equipe de crescimento" subtitle="Quem você adicionar aqui entra em /admin e vê só a aba Crescimento: métricas, contatos, suporte, NPS e investimento. Não mexe em cobrança, planos nem recebe os seus avisos.">
      <form onSubmit={add} className="grid sm:grid-cols-3 gap-2 mb-4">
        <input type="email" className="input-field text-sm" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail da conta da pessoa" required aria-label="E-mail" />
        <input className="input-field text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (opcional)" aria-label="Nome" />
        <button type="submit" className="btn-primary text-sm"><UserPlus size={15} /> Liberar acesso</button>
      </form>
      <p className="text-xs text-gray-500 mb-3">A pessoa precisa ter uma conta no Freguês com esse e-mail (pode criar pelo cadastro normal).</p>
      {error ? <p className="text-sm text-red-600">{error}</p> : !data ? <Spinner /> : data.team.length === 0 ? <p className="text-sm text-gray-500">Ninguém na equipe ainda.</p> : (
        <ul className="divide-y divide-gray-100">
          {data.team.map((m) => (
            <li key={m.email} className="flex items-center gap-3 py-2 text-sm">
              <span className="flex-1 min-w-0 truncate"><strong>{m.name || m.email}</strong>{m.name ? ` · ${m.email}` : ''}</span>
              <span className="text-xs text-gray-400">{dateTimeBR(m.created_at)}</span>
              <button onClick={() => remove(m)} className="p-1 text-gray-300 hover:text-red-500" aria-label="Remover"><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

// ---------------- Avisos (só dono) ----------------
interface Alert { id: string; kind: string; title: string; body: string | null; url: string | null; created_at: string; read_at: string | null }

export function AlertsTab({ onRead }: { onRead: () => void }) {
  const { data, error, load } = useLoad<{ alerts: Alert[]; unread: number; devices: number }>('/api/admin/alerts')
  const [enabling, setEnabling] = useState(false)

  const enable = async () => {
    setEnabling(true)
    const res = await enableOwnerAlerts()
    setEnabling(false)
    if (res.ok) {
      toast.success('Avisos ativados neste aparelho. Mandamos um de teste.')
      load()
    } else toast.error(res.error || 'Não foi possível ativar.')
  }
  const readAll = async () => {
    await api('/api/admin/alerts', { method: 'PATCH', body: '{}' }).catch(() => {})
    load()
    onRead()
  }

  if (error) return <div className="card text-sm text-red-600">{error}</div>
  if (!data) return <Spinner />

  return (
    <div className="space-y-4">
      <Section title="Avisos no seu celular" subtitle="Só você (dono) recebe: novo cadastro iniciado, loja criada, 1º pedido de cada loja, pagamento e cancelamento de plano, chamado de suporte, nota baixa no NPS, erro crítico e o resumo das 9h.">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={enable} disabled={enabling || !isPushSupported()} className="btn-primary text-sm">
            {enabling ? <Loader2 size={15} className="animate-spin" /> : <BellRing size={15} />} Ativar avisos neste aparelho
          </button>
          <span className="text-sm text-gray-600"><Bell size={14} className="inline" /> {data.devices} aparelho(s) seu(s) recebendo</span>
        </div>
        <p className="text-xs text-gray-500 mt-2">No iPhone, abra o Freguês pelo app instalado na tela de início (Compartilhar → Adicionar à Tela de Início) e ative por lá.</p>
      </Section>

      <Section title="Últimos avisos" right={data.unread > 0 ? <button onClick={readAll} className="btn-secondary text-sm py-1.5"><CheckCheck size={15} /> Marcar {data.unread} como lidos</button> : undefined}>
        {data.alerts.length === 0 ? <p className="text-sm text-gray-500">Nenhum aviso ainda.</p> : (
          <ul className="divide-y divide-gray-100">
            {data.alerts.map((a) => (
              <li key={a.id} className={`py-2.5 ${a.read_at ? '' : 'font-medium'}`}>
                <a href={a.url || '/admin/crescimento'} className="block">
                  <p className="text-sm text-gray-900 flex items-center gap-2">{!a.read_at && <span className="w-2 h-2 rounded-full bg-primary-500" />}{a.title}</p>
                  {a.body && <p className="text-xs text-gray-600 font-normal">{a.body}</p>}
                  <p className="text-[11px] text-gray-400 font-normal">{dateTimeBR(a.created_at)}</p>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
