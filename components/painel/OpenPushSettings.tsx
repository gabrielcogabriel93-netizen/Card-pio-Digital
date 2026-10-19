'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { logError } from '@/lib/logger'
import { formatBRL } from '@/lib/money'
import { buildOpenPushMessage, type OpenPushProduct } from '@/lib/openPushMessage'
import { PUSH_BODY_MAX, PUSH_TITLE_MAX } from '@/lib/pushAudience'
import { toast } from '@/components/Feedback'
import { Loader2, Store as StoreIcon } from 'lucide-react'

interface Settings {
  open_push_enabled: boolean
  open_push_mode: 'auto' | 'custom'
  open_push_title: string
  open_push_body: string
  open_push_product_id: string
  open_push_last_sent_at: string | null
}

/**
 * Aviso automático "a loja abriu" (migration 051): uma notificação por
 * dia para os clientes, quando a loja abre. O lojista escolhe a mensagem
 * dele ou deixa o sistema escolher um produto do cardápio por dia (só
 * com nome, preço e foto cadastrados, nunca promoção inventada).
 */
export function OpenPushSettings({ storeId, storeName, products }: { storeId: string; storeName: string; products: OpenPushProduct[] }) {
  const [s, setS] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    createClient()
      .from('establishments')
      .select('open_push_enabled, open_push_mode, open_push_title, open_push_body, open_push_product_id, open_push_last_sent_at')
      .eq('id', storeId)
      .single()
      .then(({ data, error }) => {
        if (error) {
          // Coluna ainda não existe (migration 051 não rodou): esconde o cartão.
          logError('painel:aviso-abertura', 'erro ao carregar configuração', error)
          return
        }
        setS({
          open_push_enabled: !!data.open_push_enabled,
          open_push_mode: data.open_push_mode === 'custom' ? 'custom' : 'auto',
          open_push_title: data.open_push_title || '',
          open_push_body: data.open_push_body || '',
          open_push_product_id: data.open_push_product_id || '',
          open_push_last_sent_at: data.open_push_last_sent_at,
        })
      })
  }, [storeId])

  const preview = useMemo(() => {
    if (!s) return null
    return buildOpenPushMessage(
      { name: storeName, open_push_mode: s.open_push_mode, open_push_title: s.open_push_title, open_push_body: s.open_push_body },
      products,
      new Intl.DateTimeFormat('en-CA').format(new Date()),
      s.open_push_product_id || null
    )
  }, [s, storeName, products])

  if (!s) return null

  const save = async (next: Settings) => {
    if (next.open_push_mode === 'custom' && next.open_push_enabled && (!next.open_push_title.trim() || !next.open_push_body.trim())) {
      toast('Escreva o título e a mensagem, ou use o modo automático.')
      return
    }
    setSaving(true)
    const { error } = await createClient()
      .from('establishments')
      .update({
        open_push_enabled: next.open_push_enabled,
        open_push_mode: next.open_push_mode,
        open_push_title: next.open_push_title.trim() || null,
        open_push_body: next.open_push_body.trim() || null,
        open_push_product_id: next.open_push_product_id || null,
      })
      .eq('id', storeId)
    setSaving(false)
    if (error) {
      logError('painel:aviso-abertura', 'erro ao salvar', error)
      toast.error('Não foi possível salvar: ' + error.message)
      return
    }
    setS(next)
    toast.success(next.open_push_enabled ? 'Aviso de abertura ligado' : 'Aviso de abertura desligado')
  }

  const lastSent = s.open_push_last_sent_at
    ? new Date(s.open_push_last_sent_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <section className="card space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><StoreIcon size={18} /> Aviso de loja aberta</h2>
          <p className="text-sm text-gray-600 mt-0.5">
            Uma notificação por dia para seus clientes quando a loja abre (pelo horário de funcionamento ou quando você liga &quot;Aberta&quot;).
            Não conta no limite de 3 mensagens.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={s.open_push_enabled}
          aria-label="Ligar aviso de loja aberta"
          disabled={saving}
          onClick={() => save({ ...s, open_push_enabled: !s.open_push_enabled })}
          className={`relative w-14 h-7 rounded-full transition-colors flex-shrink-0 ${s.open_push_enabled ? 'bg-green-500' : 'bg-gray-300'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${s.open_push_enabled ? 'translate-x-7' : ''}`} />
        </button>
      </div>

      <div className="grid sm:grid-cols-2 gap-2">
        {([
          { mode: 'auto', title: 'Automático', desc: 'Todo dia o sistema escolhe um produto seu (com foto, nome e preço do cardápio). Nunca cria promoção.' },
          { mode: 'custom', title: 'Minha mensagem', desc: 'Você escreve o texto e, se quiser, escolhe o produto que abre ao tocar.' },
        ] as const).map((o) => (
          <button
            key={o.mode}
            type="button"
            onClick={() => setS({ ...s, open_push_mode: o.mode })}
            aria-pressed={s.open_push_mode === o.mode}
            className={`text-left rounded-xl border-2 p-3 ${s.open_push_mode === o.mode ? 'border-primary-500 bg-primary-50' : 'border-gray-200'}`}
          >
            <p className="font-medium text-sm text-gray-900">{o.title}</p>
            <p className="text-xs text-gray-600 mt-0.5">{o.desc}</p>
          </button>
        ))}
      </div>

      {s.open_push_mode === 'custom' && (
        <div className="space-y-3">
          <input className="input-field" maxLength={PUSH_TITLE_MAX} value={s.open_push_title} onChange={(e) => setS({ ...s, open_push_title: e.target.value })} placeholder={`${storeName} está aberta! 🔥`} aria-label="Título do aviso" />
          <textarea className="input-field" rows={2} maxLength={PUSH_BODY_MAX} value={s.open_push_body} onChange={(e) => setS({ ...s, open_push_body: e.target.value })} placeholder="Já estamos atendendo. Toque para pedir." aria-label="Mensagem do aviso" />
          <select className="input-field" value={s.open_push_product_id} onChange={(e) => setS({ ...s, open_push_product_id: e.target.value })} aria-label="Produto que abre ao tocar">
            <option value="">Abrir o cardápio</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} · {formatBRL(Number(p.price))}</option>)}
          </select>
        </div>
      )}

      {preview && (
        <div className="rounded-xl bg-gray-50 p-3">
          <p className="text-xs font-medium text-gray-500">{s.open_push_mode === 'auto' ? 'Exemplo de hoje (muda todo dia)' : 'Como vai aparecer'}</p>
          <p className="text-sm font-semibold text-gray-900 mt-1">{preview.title}</p>
          <p className="text-sm text-gray-700">{preview.body}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500">{lastSent ? `Último envio: ${lastSent}` : 'Ainda não foi enviado.'}</p>
        <button type="button" onClick={() => save(s)} disabled={saving} className="btn-primary text-sm">
          {saving ? <Loader2 size={16} className="animate-spin" /> : 'Salvar'}
        </button>
      </div>
    </section>
  )
}
