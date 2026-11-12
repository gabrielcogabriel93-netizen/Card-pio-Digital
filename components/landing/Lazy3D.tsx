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
  return <div ref={ref} className="w-full h-full">{show ? <Model3DViewer src={src} alt={alt} /> : <div className="w-full h-full bg-gradient-to-b from-white to-gray-100" />}</div>
}
