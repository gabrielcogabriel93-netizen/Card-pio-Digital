'use client'

import Image, { type ImageProps } from 'next/image'

// NEXT_PUBLIC_* é inlined no bundle do client em build time — seguro de ler
// aqui. Mesmo host que next.config.js usa pra montar o remotePatterns.
function isOptimizableSrc(src: string): boolean {
  if (!src) return false
  if (!/^https?:\/\//.test(src)) return true // caminho local (ex: /icons/...) — mesma origem, sempre ok

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl) return false
    return new URL(src).hostname === new URL(supabaseUrl).hostname
  } catch {
    return false
  }
}

/**
 * Substituto "drop-in" de next/image em modo `fill` — é o único modo usado
 * no app (produto/logo dentro de uma div `relative` com tamanho fixo, ver
 * PublicMenuClient/painel/balcao). Só passa pelo otimizador (`/_next/image`)
 * quando a URL é do nosso próprio Supabase Storage, que é o único host
 * liberado em `next.config.js` (`images.remotePatterns`) — restringido de
 * propósito pra fechar o Image Optimizer como proxy aberto (ver comentário
 * lá). Fotos salvas por URL externa no fluxo antigo (antes do upload direto
 * pro Storage, ver README) continuam funcionando via `<img>` comum, só sem
 * a otimização — nunca quebra uma foto que já existia antes dessa restrição.
 */
export function SmartImage({ src, alt, className, ...rest }: ImageProps) {
  const srcStr = typeof src === 'string' ? src : ''

  if (!isOptimizableSrc(srcStr)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- fallback proposital pra host não otimizável (ver isOptimizableSrc)
      <img
        src={srcStr}
        alt={alt}
        className={`absolute inset-0 w-full h-full ${className || ''}`}
      />
    )
  }

  return <Image src={src} alt={alt} className={className} {...rest} />
}
