'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { drawProductArt } from '@/lib/marketingArt'
import { formatBRL } from '@/lib/money'
import { toast } from '@/components/Feedback'
import { Bell, Copy, Download, Loader2, RefreshCw, Sparkles } from 'lucide-react'

interface Suggestion {
  id: string
  headline: string
  subline: string | null
  caption: string
  hashtags: string[]
  push_title: string
  push_body: string
  provider: 'claude' | 'gemini' | 'fregues'
  product_ids: string[]
  products: { id: string; name: string; price: number; image_url: string | null }[]
}

const PROVIDER_LABEL = { claude: 'Escrita por IA (Claude)', gemini: 'Escrita por IA (Gemini)', fregues: 'Gerador do Freguês' }

/**
 * Sugestão de divulgação do dia: o produto da vez com a FOTO dele em uma
 * arte de post e de story, a legenda pronta e o texto de notificação.
 */
export function DailySuggestion({
  store,
  url,
}: {
  store: { slug: string; name: string; theme_color: string | null; logo_url: string | null }
  url: string
}) {
  const [s, setS] = useState<Suggestion | null>(null)
  const [reason, setReason] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [caption, setCaption] = useState('')
  const post = useRef<HTMLCanvasElement | null>(null)
  const story = useRef<HTMLCanvasElement | null>(null)

  const apply = (data: { suggestion?: Suggestion | null; reason?: string; error?: string }) => {
    if (data.error) throw new Error(data.error)
    setS(data.suggestion || null)
    setReason(data.reason || null)
    if (data.suggestion) setCaption(`${data.suggestion.caption}\n\n${data.suggestion.hashtags.join(' ')}`)
  }

  useEffect(() => {
    fetch('/api/marketing/suggestion')
      .then((r) => r.json())
      .then(apply)
      .catch((err) => setReason(err.message || 'Não foi possível carregar a sugestão.'))
      .finally(() => setLoading(false))
  }, [])

  const product = s?.products.find((p) => p.id === s.product_ids[0]) || s?.products[0]

  const render = useCallback(async () => {
    if (!s) return
    const common = {
      storeName: store.name,
      url,
      themeColor: store.theme_color,
      logoUrl: store.logo_url,
      productImageUrl: product?.image_url,
      headline: s.headline,
      subline: s.subline || (product ? `${product.name} · ${formatBRL(Number(product.price))}` : ''),
    }
    if (post.current) await drawProductArt(post.current, { ...common, format: 'post' })
    if (story.current) await drawProductArt(story.current, { ...common, format: 'story' })
  }, [s, store, url, product])

  useEffect(() => {
    render()
  }, [render])

  const regenerate = async () => {
    setRegenerating(true)
    try {
      const res = await fetch('/api/marketing/suggestion', { method: 'POST' })
      apply(await res.json())
    } catch (err: any) {
      toast(err.message)
    } finally {
      setRegenerating(false)
    }
  }

  const download = (canvas: HTMLCanvasElement | null, name: string) => {
    if (!canvas) return
    try {
      const link = document.createElement('a')
      link.download = `${store.slug}-${name}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch {
      toast.error('Não deu para baixar a imagem (a foto bloqueou a exportação).')
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(caption)
      toast.success('Legenda copiada')
    } catch {
      toast('Selecione o texto e copie manualmente.')
    }
  }

  if (loading) {
    return <div className="card flex items-center gap-2 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" /> Preparando a sugestão de hoje…</div>
  }
  if (!s) {
    return <div className="card text-sm text-gray-600"><Sparkles size={16} className="inline text-primary-600 mr-1" /> {reason || 'Sem sugestão hoje.'}</div>
  }

  const notifyHref = `/painel/notificacoes?${new URLSearchParams({ title: s.push_title, body: s.push_body, product: product?.id || '', source: 'sugestao' })}`

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-extrabold text-gray-900 flex items-center gap-2"><Sparkles size={18} className="text-primary-600" /> Sugestão de hoje</h2>
          <p className="text-xs text-gray-500">{PROVIDER_LABEL[s.provider]} · com a foto de {product?.name || 'um produto seu'}</p>
        </div>
        <button onClick={regenerate} disabled={regenerating} className="btn-secondary text-sm">
          {regenerating ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Gerar outra
        </button>
      </div>

      <div className="grid md:grid-cols-[1fr_1fr_1.2fr] gap-4">
        <div className="space-y-2">
          <canvas ref={post} className="w-full h-auto rounded-xl shadow-sm bg-gray-100" style={{ aspectRatio: '1080 / 1350' }} aria-label="Prévia do post" />
          <button onClick={() => download(post.current, 'post-do-dia')} className="btn-secondary w-full text-sm"><Download size={15} /> Baixar post</button>
        </div>
        <div className="space-y-2">
          <canvas ref={story} className="w-full h-auto rounded-xl shadow-sm bg-gray-100 max-h-[420px] object-contain" style={{ aspectRatio: '1080 / 1920' }} aria-label="Prévia do story" />
          <button onClick={() => download(story.current, 'story-do-dia')} className="btn-secondary w-full text-sm"><Download size={15} /> Baixar story</button>
        </div>
        <div className="space-y-3">
          <div>
            <label htmlFor="s-caption" className="block text-sm font-medium text-gray-700 mb-1">Legenda</label>
            <textarea id="s-caption" className="input-field text-sm" rows={9} value={caption} onChange={(e) => setCaption(e.target.value)} />
            <button onClick={copy} className="btn-secondary text-sm mt-2 w-full"><Copy size={15} /> Copiar legenda</button>
          </div>
          <div className="rounded-xl bg-gray-50 p-3">
            <p className="text-xs font-medium text-gray-500">Notificação sugerida</p>
            <p className="text-sm font-semibold text-gray-900 mt-1">{s.push_title}</p>
            <p className="text-sm text-gray-700">{s.push_body}</p>
            <Link href={notifyHref} className="btn-primary text-sm mt-3 w-full"><Bell size={15} /> Enviar para os clientes</Link>
          </div>
        </div>
      </div>
    </section>
  )
}
