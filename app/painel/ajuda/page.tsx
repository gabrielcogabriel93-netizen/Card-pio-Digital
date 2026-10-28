'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatPhoneNumber } from '@/lib/phone'
import { logError } from '@/lib/logger'
import { toast } from '@/components/Feedback'
import { LifeBuoy, Loader2, Send, BookOpen } from 'lucide-react'

interface Ticket {
  id: string
  subject: string
  message: string
  status: 'aberto' | 'em_andamento' | 'resolvido'
  admin_reply: string | null
  created_at: string
}

const STATUS: Record<Ticket['status'], { label: string; cls: string }> = {
  aberto: { label: 'Aberto', cls: 'bg-amber-50 text-amber-800' },
  em_andamento: { label: 'Em andamento', cls: 'bg-blue-50 text-blue-800' },
  resolvido: { label: 'Resolvido', cls: 'bg-green-50 text-green-800' },
}

const SUBJECTS = ['Dúvida sobre o painel', 'Problema com pedidos', 'Pagamentos e planos', 'Cardápio e produtos', 'Notificações e app', 'Sugestão', 'Outro']

/** Ajuda: abre um chamado para a equipe do Freguês e acompanha a resposta. */
export default function AjudaPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [subject, setSubject] = useState(SUBJECTS[0])
  const [message, setMessage] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    try {
      const supabase = createClient()
      const [{ data }, { data: { user } }] = await Promise.all([
        supabase.from('support_tickets').select('id, subject, message, status, admin_reply, created_at').order('created_at', { ascending: false }).limit(30),
        supabase.auth.getUser(),
      ])
      setTickets((data || []) as Ticket[])
      if (user && !whatsapp) {
        const { data: est } = await supabase.from('establishments').select('whatsapp_number').eq('owner_id', user.id).maybeSingle()
        if (est?.whatsapp_number) setWhatsapp(formatPhoneNumber(est.whatsapp_number))
      }
    } catch (err) {
      logError('painel:ajuda', 'erro ao carregar chamados', err)
    } finally {
      setLoading(false)
    }
  }, [whatsapp])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return
    setSending(true)
    const { error } = await createClient().rpc('open_support_ticket', { p_subject: subject, p_message: message.trim(), p_whatsapp: whatsapp || null })
    setSending(false)
    if (error) {
      toast.error(error.message || 'Não foi possível enviar agora.')
      return
    }
    toast.success('Recebemos seu chamado. Vamos responder pelo WhatsApp e aqui nesta página.')
    setMessage('')
    load()
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="page-title flex items-center gap-2"><LifeBuoy size={24} className="text-primary-600" /> Ajuda</h1>
        <p className="text-gray-600 mt-1">Conte o que precisa e nossa equipe responde pelo WhatsApp. Para o passo a passo, veja o <Link href="/painel/tutorial" className="text-primary-600 underline">Tutorial</Link>.</p>
      </div>

      <form onSubmit={send} className="card space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="h-subject" className="block text-sm font-medium text-gray-700 mb-1">Assunto</label>
            <select id="h-subject" className="input-field" value={subject} onChange={(e) => setSubject(e.target.value)}>
              {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="h-wa" className="block text-sm font-medium text-gray-700 mb-1">WhatsApp para resposta</label>
            <input id="h-wa" type="tel" className="input-field" value={whatsapp} onChange={(e) => setWhatsapp(formatPhoneNumber(e.target.value))} placeholder="(11) 99999-8888" />
          </div>
        </div>
        <div>
          <label htmlFor="h-msg" className="block text-sm font-medium text-gray-700 mb-1">O que aconteceu?</label>
          <textarea id="h-msg" className="input-field" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Descreva com o máximo de detalhes: em qual tela, o que você tentou fazer e o que apareceu." maxLength={3000} required />
        </div>
        <button type="submit" className="btn-primary" disabled={sending || !message.trim()}>
          {sending ? <Loader2 size={18} className="animate-spin" /> : <><Send size={16} /> Enviar chamado</>}
        </button>
      </form>

      <section className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Seus chamados</h2>
        {loading ? (
          <Loader2 className="animate-spin text-primary-500" />
        ) : tickets.length === 0 ? (
          <p className="text-sm text-gray-500 flex items-center gap-2"><BookOpen size={16} /> Nenhum chamado ainda.</p>
        ) : (
          <ul className="space-y-3">
            {tickets.map((t) => (
              <li key={t.id} className="rounded-xl border border-gray-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-gray-900 text-sm">{t.subject}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS[t.status].cls}`}>{STATUS[t.status].label}</span>
                </div>
                <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">{t.message}</p>
                {t.admin_reply && <p className="text-sm mt-2 rounded-lg bg-primary-50 p-2 text-gray-800 whitespace-pre-line"><strong>Equipe Freguês:</strong> {t.admin_reply}</p>}
                <p className="text-xs text-gray-400 mt-2">{new Date(t.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
