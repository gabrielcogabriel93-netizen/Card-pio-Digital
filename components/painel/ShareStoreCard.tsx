'use client'

import { useState } from 'react'
import Link from 'next/link'
import { publicStoreUrl } from '@/lib/domains'
import { toast } from '@/components/Feedback'
import { Copy, Send, Megaphone, Instagram } from 'lucide-react'

/**
 * "Compartilhe sua loja": mostra a prévia que o cliente vê ao receber o
 * link (imagem gerada com a marca da loja) e entrega textos prontos para
 * WhatsApp e Instagram.
 */
export function ShareStoreCard({ slug, name, customDomain }: { slug: string; name: string; customDomain?: string | null }) {
  const [imgOk, setImgOk] = useState(true)
  const url = publicStoreUrl({
    slug,
    customDomain,
    rootDomain: process.env.NEXT_PUBLIC_ROOT_DOMAIN,
    baseUrl: typeof window !== 'undefined' ? window.location.origin : '',
  })
  const whatsappText = `Agora você pode pedir na ${name} pelo nosso link, rapidinho e sem taxa de app: ${url}`

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} copiado`)
    } catch {
      toast('Não deu para copiar. Selecione o texto e copie manualmente.')
    }
  }

  return (
    <div className="card">
      <div className="flex flex-col md:flex-row gap-5">
        <div className="md:w-72 flex-shrink-0">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Como o cliente vê o link</p>
          <div className="rounded-xl overflow-hidden border border-gray-200 bg-[#DCF8C6]">
            {imgOk ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/loja/${slug}/opengraph-image`} alt={`Prévia do link da ${name}`} className="w-full aspect-[1.91/1] object-cover bg-gray-100" onError={() => setImgOk(false)} />
            ) : (
              <div className="w-full aspect-[1.91/1] bg-primary-500" />
            )}
            <div className="p-2.5 text-xs">
              <p className="font-semibold text-gray-900">{name} · Peça online</p>
              <p className="text-gray-500 truncate">{url.replace(/^https?:\/\//, '')}</p>
            </div>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-lg font-extrabold text-gray-900">Compartilhe sua loja</h2>
          <p className="text-sm text-gray-600 mt-1">Cada cliente que pede pelo seu link é um pedido sem comissão de aplicativo.</p>
          <div className="flex items-center gap-2 mt-3 p-2.5 bg-gray-50 rounded-lg">
            <span className="flex-1 min-w-0 truncate text-sm font-medium text-gray-900">{url}</span>
            <button onClick={() => copy(url, 'Link')} className="btn-secondary text-xs py-1.5 px-2.5"><Copy size={14} /> Copiar</button>
          </div>
          <div className="grid sm:grid-cols-3 gap-2 mt-3">
            <a href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`} target="_blank" rel="noopener noreferrer" className="btn-primary text-sm py-2">
              <Send size={15} /> WhatsApp
            </a>
            <button onClick={() => copy(url, 'Link para a bio')} className="btn-secondary text-sm py-2"><Instagram size={15} /> Bio do Instagram</button>
            <Link href="/painel/divulgar" className="btn-secondary text-sm py-2"><Megaphone size={15} /> Kit de divulgação</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
