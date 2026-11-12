'use client'

// Só baixa o visualizador 3D (e o modelo) quando a seção aparece na tela.
import { useEffect, useRef, useState } from 'react'
import { Model3DViewer } from '@/components/store/Model3DViewer'

export function Lazy3D({ src, alt }: { src: string; alt: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [show, setShow] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setShow(true); io.disconnect() }
    }, { rootMargin: '300px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return <div ref={ref} className="w-full h-full">{show ? <Model3DViewer src={src} alt={alt} qrHint={false} /> : <div className="w-full h-full bg-gradient-to-b from-white to-gray-100" />}</div>
}

// Vídeo que só baixa quando aparece na tela; toca mudo, em loop, e pausa fora da tela.
export function LazyVideo({ src, poster, className, label }: { src: string; poster: string; className?: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [load, setLoad] = useState(false)
  const visible = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const io = new IntersectionObserver((entries) => {
      visible.current = entries.some((e) => e.isIntersecting)
      if (visible.current) setLoad(true)
      if (visible.current && !reduce && el.src) el.play().catch(() => {})
      if (!visible.current) el.pause()
    }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const onCanPlay = () => {
    const el = ref.current
    if (el && visible.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) el.play().catch(() => {})
  }
  return (
    <video ref={ref} className={className} poster={poster} muted loop playsInline preload={load ? "auto" : "none"} onCanPlay={onCanPlay} aria-label={label || undefined} aria-hidden={label ? undefined : true} src={load ? src : undefined} />
  )
}
