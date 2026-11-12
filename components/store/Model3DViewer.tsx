'use client'

// Prato em 3D e "Ver na minha mesa" (realidade aumentada) com o
// <model-viewer> do Google. O pacote só é baixado quando o cliente toca em
// 3D. Android abre o visualizador de RA do Google (ou WebXR); iPhone abre o
// Quick Look, com o .usdz do lojista ou um gerado na hora a partir do .glb.
import { useEffect, useRef, useState } from 'react'
import { QrCodeImage } from '@/components/QrCodeImage'
import { Box, Loader2, Smartphone } from 'lucide-react'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>
    }
  }
}

let loader: Promise<void> | null = null
function loadModelViewer() {
  if (!loader) {
    loader = import('@google/model-viewer').then(({ ModelViewerElement }) => {
      // Decodificadores servidos pelo próprio site (o CSP não libera CDN).
      const el = ModelViewerElement as unknown as Record<string, string>
      el.dracoDecoderLocation = '/vendor/draco/'
      el.ktx2TranscoderLocation = '/vendor/basis/'
      // O decodificador meshopt já vem no pacote; o model-viewer só carrega este script vazio antes de usá-lo.
      el.meshoptDecoderLocation = '/vendor/meshopt/embutido.js'
    })
    loader.catch(() => { loader = null })
  }
  return loader
}

interface Props {
  src: string
  iosSrc?: string | null
  poster?: string | null
  alt: string
  /** QR code "abra no celular" quando o aparelho não tem RA (desligado na landing, que já explica isso). */
  qrHint?: boolean
}

export function Model3DViewer({ src, iosSrc, poster, alt, qrHint = true }: Props) {
  const ref = useRef<HTMLElement | null>(null)
  const [ready, setReady] = useState(false)
  const [progress, setProgress] = useState(0)
  const [failed, setFailed] = useState<string | null>(null)
  const [canAR, setCanAR] = useState<boolean | null>(null)
  const [arMsg, setArMsg] = useState<string | null>(null)
  const [pageUrl, setPageUrl] = useState('')
  const [touch, setTouch] = useState(false)

  useEffect(() => {
    setPageUrl(window.location.href)
    setTouch(window.matchMedia('(pointer: coarse)').matches)
    let alive = true
    loadModelViewer().then(() => alive && setReady(true)).catch(() => alive && setFailed('Não foi possível abrir o 3D neste aparelho.'))
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!ready || !el) return
    const onProgress = (e: Event) => setProgress((e as CustomEvent<{ totalProgress: number }>).detail.totalProgress)
    const onLoad = () => {
      setProgress(1)
      setCanAR(!!(el as unknown as { canActivateAR?: boolean }).canActivateAR)
    }
    const onError = () => setFailed('Não foi possível carregar o prato em 3D. Confira sua internet e tente de novo.')
    const onAr = (e: Event) => {
      const status = (e as CustomEvent<{ status: string }>).detail.status
      if (status === 'failed') setArMsg('A realidade aumentada não abriu neste celular. Você ainda pode girar o prato em 3D.')
      else setArMsg(null)
    }
    el.addEventListener('progress', onProgress)
    el.addEventListener('load', onLoad)
    el.addEventListener('error', onError)
    el.addEventListener('ar-status', onAr)
    return () => {
      el.removeEventListener('progress', onProgress)
      el.removeEventListener('load', onLoad)
      el.removeEventListener('error', onError)
      el.removeEventListener('ar-status', onAr)
    }
  }, [ready])

  if (failed) {
    return <div className="w-full h-full flex items-center justify-center text-sm text-gray-500 p-6 text-center bg-gray-50">{failed}</div>
  }

  return (
    <div className="relative w-full h-full bg-gradient-to-b from-white to-gray-100">
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm gap-2"><Loader2 size={18} className="animate-spin" /> Abrindo o 3D…</div>
      )}
      {ready && (
        <model-viewer
          ref={ref}
          src={src}
          {...(iosSrc ? { 'ios-src': iosSrc } : {})}
          {...(poster ? { poster } : {})}
          alt={alt}
          ar=""
          ar-modes="scene-viewer webxr quick-look"
          ar-scale="fixed"
          ar-placement="floor"
          camera-controls=""
          auto-rotate=""
          auto-rotate-delay="1500"
          rotation-per-second="20deg"
          touch-action="pan-y"
          interaction-prompt="auto"
          shadow-intensity="1"
          shadow-softness="0.8"
          exposure="1"
          environment-image="neutral"
          loading="eager"
          reveal="auto"
          style={{ width: '100%', height: '100%', background: 'transparent', ['--poster-color' as string]: 'transparent' }}
        >
          <button
            slot="ar-button"
            type="button"
            className="absolute bottom-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 rounded-full bg-amber-300 text-gray-900 font-bold text-sm px-4 py-2.5 shadow-lg"
          >
            <Box size={16} /> Ver na minha mesa
          </button>
          <div slot="progress-bar" />
        </model-viewer>
      )}
      {ready && progress > 0 && progress < 1 && (
        <div className="absolute left-4 right-4 top-3 h-1.5 rounded-full bg-gray-200 overflow-hidden">
          <div className="h-full bg-primary-600 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      {canAR === false && touch && (
        <p className="absolute bottom-2 left-2 right-2 rounded-xl bg-white/95 shadow p-2 text-xs text-gray-700">Este celular não tem realidade aumentada. Arraste para girar o prato em 3D.</p>
      )}
      {qrHint && canAR === false && !touch && pageUrl && (
        <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2 rounded-xl bg-white/95 shadow p-2 text-xs text-gray-700">
          <QrCodeImage value={pageUrl} size={64} className="rounded" />
          <span className="flex-1"><span className="font-semibold text-gray-900 flex items-center gap-1"><Smartphone size={13} /> Ver na sua mesa</span>Aponte a câmera do celular para o código e abra este prato em 3D. A realidade aumentada funciona no celular.</span>
        </div>
      )}
      {arMsg && <p className="absolute top-3 left-3 right-3 rounded-lg bg-amber-50 text-amber-800 text-xs p-2">{arMsg}</p>}
    </div>
  )
}
