'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { toast } from '@/components/Feedback'
import { Copy, MessageCircle, Share2, X } from 'lucide-react'

/**
 * Compartilhar o cardápio com amigos: QR Code para quem está do lado
 * (aponta a câmera e abre o cardápio), menu de compartilhar do celular,
 * WhatsApp e copiar link. Tudo com a marca da loja.
 */
export function ShareMenu({ storeName, logoUrl, qrColor, onClose }: { storeName: string; logoUrl?: string | null; qrColor: string; onClose: () => void }) {
  const [qr, setQr] = useState<string | null>(null)
  const [url, setUrl] = useState('')

  useEffect(() => {
    // Endereço limpo do cardápio (sem mesa, produto ou outros parâmetros).
    const clean = `${window.location.origin}${window.location.pathname}`
    setUrl(clean)
    QRCode.toDataURL(clean, { errorCorrectionLevel: 'H', margin: 1, width: 560, color: { dark: qrColor, light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(null))
  }, [qrColor])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const text = `Olha o cardápio da ${storeName}! Dá para pedir direto por aqui:`
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const share = async () => {
    try {
      await navigator.share({ title: storeName, text, url })
    } catch {
      // cancelado pelo cliente: nada a fazer
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copiado')
    } catch {
      toast('Selecione o link e copie manualmente.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="share-title">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl shadow-xl p-6 text-center animate-slide-up sm:animate-fade-in max-h-[92vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
      >
        <button onClick={onClose} className="absolute right-4 top-4 p-1 text-gray-400 hover:text-gray-600" aria-label="Fechar">
          <X size={20} />
        </button>
        <h2 id="share-title" className="font-display text-xl font-extrabold text-gray-900">Compartilhe o cardápio</h2>
        <p className="text-sm text-gray-600 mt-1">Quem estiver do seu lado aponta a câmera para o código e já abre o cardápio da {storeName}.</p>

        <div className="relative mx-auto mt-5 w-64 h-64 rounded-2xl border border-gray-100 shadow-sm bg-white p-2 flex items-center justify-center">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={`QR Code do cardápio da ${storeName}`} className="w-full h-full" />
          ) : (
            <div className="w-full h-full rounded-xl bg-gray-100 animate-pulse" />
          )}
          {qr && logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="absolute w-14 h-14 rounded-xl border-4 border-white object-cover bg-white shadow" />
          )}
        </div>
        <p className="text-xs text-gray-500 mt-2 break-all">{url.replace(/^https?:\/\//, '')}</p>

        <div className="grid gap-2 mt-5">
          {canShare && (
            <button onClick={share} className="btn-primary w-full py-3"><Share2 size={18} /> Compartilhar</button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`${canShare ? 'btn-secondary' : 'btn-primary'} py-3`}
            >
              <MessageCircle size={18} /> WhatsApp
            </a>
            <button onClick={copy} className="btn-secondary py-3"><Copy size={18} /> Copiar link</button>
          </div>
        </div>
      </div>
    </div>
  )
}
