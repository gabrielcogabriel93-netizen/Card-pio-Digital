'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/components/Feedback'
import { X, Loader2 } from 'lucide-react'

const SNOOZE_KEY = 'fregues_nps_snooze'

/**
 * "De 0 a 10, quanto você recomendaria o Freguês?" Aparece para lojas com
 * 14 dias ou mais, a cada 90 dias (nps_due, migration 057). Fechar adia
 * por 7 dias neste aparelho.
 */
export function NpsPrompt() {
  const [show, setShow] = useState(false)
  const [score, setScore] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    try {
      const until = Number(localStorage.getItem(SNOOZE_KEY) || 0)
      if (until > Date.now()) return
    } catch {
      // sem storage: pergunta normalmente
    }
    createClient().rpc('nps_due').then(({ data }) => setShow(data === true), () => {})
  }, [])

  const snooze = () => {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + 7 * 86_400_000))
    } catch {
      // ignora
    }
    setShow(false)
  }

  const send = async () => {
    if (score == null) return
    setSending(true)
    const { error } = await createClient().rpc('submit_nps', { p_score: score, p_comment: comment.trim() || null })
    setSending(false)
    if (error) {
      toast.error('Não foi possível enviar agora.')
      return
    }
    toast.success('Obrigado! Sua opinião ajuda muito.')
    setShow(false)
  }

  if (!show) return null

  return (
    <section className="mb-4 rounded-2xl border border-primary-100 bg-primary-50/60 p-4" aria-label="Pesquisa de satisfação">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium text-gray-900">De 0 a 10, quanto você recomendaria o Freguês para outro lojista?</p>
        <button onClick={snooze} className="p-1 text-gray-400 hover:text-gray-600" aria-label="Responder depois"><X size={18} /></button>
      </div>
      <div className="mt-3 grid grid-cols-11 gap-1" role="radiogroup" aria-label="Nota">
        {Array.from({ length: 11 }, (_, n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={score === n}
            onClick={() => setScore(n)}
            className={`h-9 rounded-lg text-sm font-semibold border ${score === n ? 'bg-primary-500 border-primary-500 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-primary-300'}`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-gray-500"><span>Nada provável</span><span>Muito provável</span></div>
      {score != null && (
        <div className="mt-3 space-y-2">
          <textarea
            className="input-field text-sm"
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={score <= 6 ? 'O que podemos melhorar?' : score <= 8 ? 'O que faltou para ser 10?' : 'O que você mais gosta?'}
            maxLength={1000}
          />
          <button onClick={send} disabled={sending} className="btn-primary text-sm">
            {sending ? <Loader2 size={16} className="animate-spin" /> : 'Enviar'}
          </button>
        </div>
      )}
    </section>
  )
}
