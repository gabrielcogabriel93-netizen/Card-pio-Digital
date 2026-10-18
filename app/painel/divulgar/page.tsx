'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { logError } from '@/lib/logger'
import { publicStoreUrl } from '@/lib/domains'
import { drawArt, ART_SIZES, type ArtKind } from '@/lib/marketingArt'
import { toast } from '@/components/Feedback'
import { DailySuggestion } from '@/components/painel/DailySuggestion'
import { Download, Loader2, Copy } from 'lucide-react'

interface StoreForArt {
  id: string
  name: string
  slug: string
  theme_color: string | null
  logo_url: string | null
  custom_domain: string | null
}

const DEFAULT_TEXT: Record<ArtKind, { headline: string; subline: string }> = {
  tent: { headline: 'Peça daqui mesmo', subline: 'Aponte a câmera do celular para o QR Code' },
  sticker: { headline: 'Gostou? Peça direto com a gente', subline: 'Sem taxa de aplicativo' },
  post: { headline: 'Peça pelo nosso link e economize', subline: 'Cardápio completo, entrega e retirada. Sem taxa de aplicativo.' },
  story: { headline: 'Bateu a fome?', subline: 'Faça seu pedido pelo nosso cardápio online' },
}

/**
 * Kit de divulgação: artes prontas com a marca da loja e o QR Code do
 * cardápio, para imprimir (display de mesa, adesivo da sacola) e postar
 * (feed e story). O adesivo vai nas sacolas de pedidos de aplicativo de
 * entrega e traz o cliente para o canal próprio da loja.
 */
export default function DivulgarPage() {
  const [store, setStore] = useState<StoreForArt | null>(null)
  const [loading, setLoading] = useState(true)
  const [texts, setTexts] = useState(DEFAULT_TEXT)
  const [tableLabel, setTableLabel] = useState('')
  const canvases = useRef<Partial<Record<ArtKind, HTMLCanvasElement | null>>>({})
  const [rendering, setRendering] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data } = await supabase.from('establishments').select('id, name, slug, theme_color, logo_url, custom_domain').eq('owner_id', user.id).single()
        if (data) setStore(data as StoreForArt)
      } catch (err) {
        logError('painel:divulgar', 'erro ao carregar loja', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const url = store
    ? publicStoreUrl({ slug: store.slug, customDomain: store.custom_domain, rootDomain: process.env.NEXT_PUBLIC_ROOT_DOMAIN, baseUrl: window.location.origin })
    : ''

  const render = useCallback(async () => {
    if (!store) return
    setRendering(true)
    try {
      for (const kind of Object.keys(ART_SIZES) as ArtKind[]) {
        const canvas = canvases.current[kind]
        if (!canvas) continue
        await drawArt(canvas, {
          kind,
          storeName: store.name,
          url,
          themeColor: store.theme_color,
          logoUrl: store.logo_url,
          headline: texts[kind].headline,
          subline: texts[kind].subline,
          tableLabel: kind === 'tent' && tableLabel.trim() ? tableLabel.trim() : undefined,
        })
      }
    } catch (err) {
      logError('painel:divulgar', 'erro ao gerar artes', err)
    } finally {
      setRendering(false)
    }
  }, [store, url, texts, tableLabel])

  useEffect(() => {
    if (!store) return
    const t = setTimeout(render, 250)
    return () => clearTimeout(t)
  }, [store, render])

  const download = (kind: ArtKind) => {
    const canvas = canvases.current[kind]
    if (!canvas || !store) return
    try {
      const link = document.createElement('a')
      link.download = `${store.slug}-${kind}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch {
      toast.error('Não deu para baixar a imagem (o logo bloqueou a exportação). Tente trocar o logo em Configurações.')
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary-500" /></div>
  if (!store) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Divulgar minha loja</h1>
        <p className="text-gray-600 mt-1">Todo dia uma sugestão nova com a foto dos seus produtos, e artes prontas com a sua marca e o QR Code do cardápio.</p>
      </div>

      <DailySuggestion store={store} url={url} />

      <div className="card flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-500">Link que vai nas artes</p>
          <p className="font-medium text-gray-900 truncate">{url}</p>
        </div>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url)
              toast.success('Link copiado')
            } catch {
              toast('Selecione o link e copie manualmente.')
            }
          }}
          className="btn-secondary text-sm"
        >
          <Copy size={15} /> Copiar link
        </button>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5">
        {(Object.keys(ART_SIZES) as ArtKind[]).map((kind) => (
          <div key={kind} className="card space-y-3">
            <h2 className="font-display font-extrabold text-gray-900">{ART_SIZES[kind].label}</h2>
            <div className="bg-gray-100 rounded-xl p-2 flex justify-center">
              <canvas
                ref={(el) => {
                  canvases.current[kind] = el
                }}
                className="w-full h-auto rounded-lg shadow-sm"
                style={{ aspectRatio: `${ART_SIZES[kind].w} / ${ART_SIZES[kind].h}` }}
                aria-label={`Prévia: ${ART_SIZES[kind].label}`}
              />
            </div>
            <div className="space-y-2">
              <input
                className="input-field text-sm"
                value={texts[kind].headline}
                onChange={(e) => setTexts((t) => ({ ...t, [kind]: { ...t[kind], headline: e.target.value } }))}
                aria-label="Título da arte"
                maxLength={60}
              />
              <input
                className="input-field text-sm"
                value={texts[kind].subline}
                onChange={(e) => setTexts((t) => ({ ...t, [kind]: { ...t[kind], subline: e.target.value } }))}
                aria-label="Texto de apoio"
                maxLength={90}
              />
              {kind === 'tent' && (
                <input className="input-field text-sm" value={tableLabel} onChange={(e) => setTableLabel(e.target.value)} placeholder="Número da mesa (opcional)" aria-label="Número da mesa" maxLength={12} />
              )}
            </div>
            <button onClick={() => download(kind)} disabled={rendering} className="btn-primary w-full text-sm">
              {rendering ? <Loader2 size={16} className="animate-spin" /> : <><Download size={16} /> Baixar PNG</>}
            </button>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-500">
        Dica: QR Codes de mesa com comanda automática ficam em <strong>Mesas</strong>. Imprima o display em A5 (papel couchê) e o adesivo em papel adesivo redondo de 8 a 10 cm.
      </p>
    </div>
  )
}
