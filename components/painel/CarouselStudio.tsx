'use client'

// Carrosséis prontos para o Instagram com os dados da loja. "Postar no
// Instagram" copia a legenda e abre o menu de compartilhar do celular com as
// imagens: o lojista escolhe Instagram, cola a legenda e põe a música.
import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { logError } from '@/lib/logger'
import { buildCarousels, type CarouselInput, type CarouselPlan } from '@/lib/carousels'
import { drawSlide, slidesToFiles } from '@/lib/carouselArt'
import { localDate, upcomingOccasions } from '@/lib/promoCalendar'
import { toast } from '@/components/Feedback'
import { CheckCircle2, ClipboardCopy, Download, Images, Instagram, Loader2, Music2, Share2 } from 'lucide-react'

interface Store { id: string; name: string; slug: string; theme_color: string | null; logo_url: string | null }

async function loadInput(store: Store): Promise<CarouselInput> {
  const supabase = createClient()
  const since = new Date(Date.now() - 30 * 86400000).toISOString()
  const [est, prods, orders, combos, coupons, loyalty, rewards] = await Promise.all([
    supabase.from('establishments').select('offers_delivery, offers_pickup, free_shipping_threshold, timezone').eq('id', store.id).maybeSingle(),
    supabase.from('public_products').select('id, name, price, original_price, image_url, description, in_stock, is_featured').eq('establishment_id', store.id),
    supabase.from('orders').select('items').eq('establishment_id', store.id).gte('created_at', since).neq('status', 'cancelled').limit(1000),
    supabase.from('combos').select('name, price, description, image_url').eq('establishment_id', store.id).eq('is_active', true).order('display_order'),
    supabase.from('coupons').select('code, discount_type, discount_value, expires_at, max_uses_per_customer, show_on_menu, is_active').eq('establishment_id', store.id).eq('is_active', true),
    supabase.from('loyalty_settings').select('is_active, points_per_currency').eq('establishment_id', store.id).maybeSingle(),
    supabase.from('loyalty_rewards').select('name, points_cost, is_active').eq('establishment_id', store.id).eq('is_active', true).order('points_cost'),
  ])
  const qty = new Map<string, number>()
  for (const o of orders.data || []) for (const it of (o.items as { product_id?: string; quantity?: number }[]) || []) {
    if (it.product_id) qty.set(it.product_id, (qty.get(it.product_id) || 0) + Number(it.quantity || 1))
  }
  const tz = est.data?.timezone || 'America/Sao_Paulo'
  const occasion = upcomingOccasions(localDate(new Date(), tz))[0] || null
  return {
    storeName: store.name,
    offersDelivery: est.data?.offers_delivery !== false,
    offersPickup: est.data?.offers_pickup !== false,
    freeShippingThreshold: est.data?.free_shipping_threshold ? Number(est.data.free_shipping_threshold) : null,
    products: (prods.data || []).filter((p) => p.in_stock).map((p) => ({
      id: p.id, name: p.name, price: Number(p.price), originalPrice: p.original_price ? Number(p.original_price) : null,
      image: p.image_url, description: p.description, qty30: qty.get(p.id) || 0, featured: !!p.is_featured,
    })),
    combos: (combos.data || []).map((c) => ({ name: c.name, price: Number(c.price), description: c.description, image: c.image_url })),
    // Só cupons que a loja divulga no cardápio (os de reativação ficam em segredo).
    coupons: (coupons.data || []).filter((c) => c.show_on_menu).map((c) => ({ code: c.code, discount_type: c.discount_type, discount_value: Number(c.discount_value), expires_at: c.expires_at, max_uses_per_customer: c.max_uses_per_customer })),
    loyalty: loyalty.data?.is_active && (rewards.data || []).length
      ? { pointsPerReal: Number(loyalty.data.points_per_currency) || 1, rewards: (rewards.data || []).map((r) => ({ name: r.name, points: r.points_cost })) }
      : null,
    occasion: occasion ? { name: occasion.name, date: occasion.date, daysUntil: occasion.daysUntil } : null,
    timeZone: tz,
  }
}

export function CarouselStudio({ store, url }: { store: Store; url: string }) {
  const [plans, setPlans] = useState<CarouselPlan[] | null>(null)
  const [selected, setSelected] = useState(0)
  const [captions, setCaptions] = useState<Record<string, string>>({})
  const [rendering, setRendering] = useState(false)
  const [busy, setBusy] = useState<'post' | 'download' | null>(null)
  const [posted, setPosted] = useState<'share' | 'desktop' | null>(null)
  const [canShareFiles, setCanShareFiles] = useState(false)
  const canvases = useRef<(HTMLCanvasElement | null)[]>([])
  const files = useRef<File[] | null>(null)

  useEffect(() => {
    loadInput(store).then((input) => setPlans(buildCarousels(input))).catch((err) => {
      logError('painel:divulgar', 'erro ao montar carrosséis', err)
      setPlans([])
    })
    try {
      const probe = new File([new Blob(['x'], { type: 'image/jpeg' })], 'x.jpg', { type: 'image/jpeg' })
      setCanShareFiles(!!navigator.canShare && navigator.canShare({ files: [probe] }))
    } catch {
      setCanShareFiles(false)
    }
  }, [store])

  const plan = plans?.[selected]
  const caption = plan ? captions[plan.key] ?? plan.caption : ''

  const render = useCallback(async () => {
    if (!plan) return
    setRendering(true)
    files.current = null
    try {
      for (let i = 0; i < plan.slides.length; i++) {
        const c = canvases.current[i]
        if (c) await drawSlide(c, plan.slides[i], { storeName: store.name, url, themeColor: store.theme_color, logoUrl: store.logo_url }, { index: i, total: plan.slides.length })
      }
      // Prepara os arquivos antes do clique: o compartilhamento precisa sair na hora do toque.
      files.current = await slidesToFiles(canvases.current.slice(0, plan.slides.length).filter(Boolean) as HTMLCanvasElement[], `${store.slug}-${plan.key.replace(/[^a-z0-9]+/gi, '-')}`)
    } catch (err) {
      logError('painel:divulgar', 'erro ao desenhar carrossel', err)
      files.current = null
    } finally {
      setRendering(false)
    }
  }, [plan, store, url])

  useEffect(() => { setPosted(null); render() }, [render])

  const copyCaption = async (silent = false) => {
    try {
      await navigator.clipboard.writeText(caption)
      if (!silent) toast.success('Legenda copiada')
      return true
    } catch {
      if (!silent) toast.error('Não deu para copiar. Selecione o texto da legenda e copie.')
      return false
    }
  }

  const download = async () => {
    if (!files.current) return toast.error('Aguarde as imagens terminarem de carregar.')
    setBusy('download')
    for (const f of files.current) {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(f)
      a.download = f.name
      a.click()
      await new Promise((r) => setTimeout(r, 250))
      URL.revokeObjectURL(a.href)
    }
    setBusy(null)
  }

  const post = async () => {
    if (!files.current) return toast.error('Aguarde as imagens terminarem de carregar.')
    // Legenda primeiro (o Instagram não recebe texto de outros apps: o lojista cola).
    const copied = copyCaption(true)
    if (canShareFiles) {
      setBusy('post')
      try {
        await navigator.share({ files: files.current, title: plan?.title })
        setPosted('share')
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError') {
          logError('painel:divulgar', 'erro ao compartilhar carrossel', err)
          toast.error('O celular não abriu o compartilhamento. Use "Baixar imagens" e poste pela galeria.')
        }
      } finally {
        setBusy(null)
      }
      await copied
      return
    }
    // Computador: baixa as imagens e abre o Instagram na web.
    await copied
    await download()
    window.open('https://www.instagram.com/', '_blank', 'noopener')
    setPosted('desktop')
  }

  if (plans === null) {
    return <div className="card flex items-center gap-2 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" /> Montando carrosséis com os dados da sua loja…</div>
  }
  if (!plan) return null

  return (
    <section className="card space-y-5">
      <div>
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Images size={20} className="text-primary-600" /> Carrosséis prontos para postar</h2>
        <p className="text-sm text-gray-600 mt-1">Montados com o que está acontecendo na sua loja: ofertas, cupons, mais pedidos, fidelidade e datas comemorativas. Escolha, revise a legenda e poste.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="Carrosséis">
        {plans.map((p, i) => (
          <button
            key={p.key}
            role="tab"
            aria-selected={i === selected}
            onClick={() => setSelected(i)}
            className={`flex-shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap ${i === selected ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            {p.title}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500 -mt-2">{plan.why}</p>

      <div className="relative">
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2" aria-label="Lâminas do carrossel">
          {plan.slides.map((_, i) => (
            <canvas
              key={`${plan.key}-${i}`}
              ref={(el) => { canvases.current[i] = el }}
              className="snap-start flex-shrink-0 w-[200px] sm:w-[240px] aspect-[4/5] rounded-xl border border-gray-200 bg-gray-50"
              aria-label={`Lâmina ${i + 1} de ${plan.slides.length}`}
            />
          ))}
        </div>
        {rendering && <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-xs text-gray-600 shadow"><Loader2 size={12} className="animate-spin" /> desenhando</span>}
      </div>

      <div>
        <label htmlFor="carousel-caption" className="text-sm font-medium text-gray-700">Legenda (pode editar)</label>
        <textarea
          id="carousel-caption"
          rows={7}
          className="input-field mt-1 text-sm"
          value={caption}
          onChange={(e) => setCaptions({ ...captions, [plan.key]: e.target.value })}
        />
      </div>

      <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-sm text-amber-900 flex gap-3">
        <Music2 size={18} className="flex-shrink-0 mt-0.5" />
        <div>
          <p><strong>Música:</strong> {plan.music.mood}. No Instagram, toque em <strong>♫ Adicionar música</strong> e procure por {plan.music.search}. As músicas em alta ficam na primeira aba.</p>
          <p className="text-xs text-amber-800 mt-1">O Instagram não deixa outros aplicativos escolherem a música: ela entra com um toque na tela de publicação.</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <button type="button" onClick={post} disabled={rendering || busy !== null} className="btn-primary flex-1">
          {busy === 'post' ? <Loader2 size={18} className="animate-spin" /> : <Instagram size={18} />} Postar no Instagram
        </button>
        <button type="button" onClick={() => copyCaption()} className="btn-secondary"><ClipboardCopy size={16} /> Copiar legenda</button>
        <button type="button" onClick={download} disabled={rendering || busy !== null} className="btn-secondary">
          {busy === 'download' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Baixar imagens
        </button>
      </div>
      <p className="text-xs text-gray-500 -mt-3 flex items-center gap-1.5"><Share2 size={12} /> {canShareFiles ? 'Abre o menu de compartilhar do celular: dá para escolher Instagram, Facebook ou o status do WhatsApp.' : 'No computador: as imagens são baixadas e o Instagram abre numa nova aba. No celular, o botão abre o Instagram direto.'}</p>

      {posted && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900 space-y-1.5" role="status">
          <p className="font-semibold flex items-center gap-1.5"><CheckCircle2 size={16} /> Legenda copiada. Agora, no Instagram:</p>
          <ol className="list-decimal pl-5 space-y-1">
            {posted === 'share' ? (
              <>
                <li>Escolha <strong>Instagram → Feed</strong> no menu que abriu.</li>
                <li>Confira a ordem das {plan.slides.length} imagens e toque em <strong>Avançar</strong>.</li>
              </>
            ) : (
              <li>Toque em <strong>Criar → Publicação</strong> e selecione as {plan.slides.length} imagens baixadas, na ordem.</li>
            )}
            <li>Toque em <strong>♫ Adicionar música</strong> e escolha uma em alta.</li>
            <li>Na legenda, segure o dedo e toque em <strong>Colar</strong>. Depois, <strong>Compartilhar</strong>.</li>
          </ol>
          {posted === 'share' && <p className="text-xs text-green-800">Se o Instagram abrir só uma imagem, use <strong>Baixar imagens</strong> e selecione todas pela galeria.</p>}
        </div>
      )}
    </section>
  )
}
