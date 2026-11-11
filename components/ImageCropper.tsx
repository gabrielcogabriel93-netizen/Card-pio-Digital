'use client'

import { useEffect, useRef, useState } from 'react'
import { coverCrop, type ImageFormat } from '@/lib/imageFormats'
import { useEscapeKey } from '@/lib/useEscapeKey'
import { Loader2, ZoomIn, ZoomOut, X } from 'lucide-react'

/**
 * Ajuste do recorte antes do upload: a moldura tem a proporção do lugar
 * onde a imagem vai (prato 4:3, banner 8:3, logo quadrado); o lojista
 * arrasta e aproxima, e a imagem sai exatamente no tamanho padrão.
 */
export function ImageCropper({ file, format, onCancel, onDone }: {
  file: File
  format: ImageFormat
  onCancel: () => void
  onDone: (cropped: File) => void
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [frameW, setFrameW] = useState(320)
  const [saving, setSaving] = useState(false)
  const frameRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const frameH = Math.round(frameW * (format.height / format.width))

  useEscapeKey(onCancel, true)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => setImg(image)
    image.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    const measure = () => setFrameW(Math.min(frameRef.current?.parentElement?.clientWidth || 320, 520))
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // Começa centralizado.
  useEffect(() => {
    if (!img) return
    const c = coverCrop(img.width, img.height, frameW, frameH, 1, -Infinity, -Infinity)
    setOffset({ x: c.x / 2, y: c.y / 2 })
    setZoom(1)
  }, [img, frameW, frameH])

  const crop = img ? coverCrop(img.width, img.height, frameW, frameH, zoom, offset.x, offset.y) : null
  const lowRes = !!crop && (crop.sw < format.width * 0.7 || crop.sh < format.height * 0.7)

  const setZoomKeepingCenter = (next: number) => {
    if (!img || !crop) return setZoom(next)
    const cx = (frameW / 2 - crop.x) / crop.scale
    const cy = (frameH / 2 - crop.y) / crop.scale
    const scale = Math.max(frameW / img.width, frameH / img.height) * next
    setZoom(next)
    setOffset({ x: frameW / 2 - cx * scale, y: frameH / 2 - cy * scale })
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!crop) return
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, ox: crop.x, oy: crop.y }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    setOffset({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) })
  }
  const onPointerUp = () => {
    drag.current = null
    if (crop) setOffset({ x: crop.x, y: crop.y })
  }

  const confirm = async () => {
    if (!img || !crop) return
    setSaving(true)
    const canvas = document.createElement('canvas')
    canvas.width = format.width
    canvas.height = format.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return setSaving(false)
    if (!format.keepTransparency) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, format.width, format.height)
    const type = format.keepTransparency ? 'image/png' : 'image/jpeg'
    canvas.toBlob((blob) => {
      setSaving(false)
      if (blob) onDone(new File([blob], `recorte.${format.keepTransparency ? 'png' : 'jpg'}`, { type }))
    }, type, 0.92)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Ajustar imagem">
      <div className="fixed inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-xl p-4 sm:p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">Ajuste o recorte</h2>
            <p className="text-xs text-gray-500">Arraste para posicionar e use o zoom. A imagem sai em {format.label} ({format.ratioLabel}).</p>
          </div>
          <button onClick={onCancel} className="p-1 text-gray-400" aria-label="Cancelar"><X size={20} /></button>
        </div>

        <div className="flex justify-center">
          <div
            ref={frameRef}
            className="relative overflow-hidden rounded-xl bg-gray-100 touch-none select-none cursor-grab active:cursor-grabbing ring-2 ring-primary-500"
            style={{ width: frameW, height: frameH }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={(e) => setZoomKeepingCenter(Math.min(4, Math.max(1, zoom - e.deltaY * 0.002)))}
          >
            {img && crop ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={img.src}
                alt=""
                draggable={false}
                className="absolute max-w-none pointer-events-none"
                style={{ left: crop.x, top: crop.y, width: img.width * crop.scale, height: img.height * crop.scale }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="animate-spin text-primary-500" /></div>
            )}
          </div>
        </div>

        <label className="flex items-center gap-3">
          <ZoomOut size={18} className="text-gray-400" />
          <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoomKeepingCenter(Number(e.target.value))} className="flex-1 accent-primary-500" aria-label="Zoom" />
          <ZoomIn size={18} className="text-gray-400" />
        </label>

        <p className="text-xs text-gray-500">{format.tip}</p>
        {lowRes && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2">Esta foto é menor que o ideal ({format.label}) e pode ficar menos nítida. Se puder, use uma foto maior.</p>}

        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="btn-secondary">Cancelar</button>
          <button onClick={confirm} disabled={!img || saving} className="btn-primary">{saving ? <Loader2 size={16} className="animate-spin" /> : 'Usar esta imagem'}</button>
        </div>
      </div>
    </div>
  )
}
