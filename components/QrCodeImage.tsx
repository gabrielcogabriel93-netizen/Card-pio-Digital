'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

interface QrCodeImageProps {
  value: string
  size?: number
  className?: string
}

export function QrCodeImage({ value, size = 220, className }: QrCodeImageProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setDataUrl(null)
    QRCode.toDataURL(value, { width: size, margin: 1 }).then((url) => {
      if (!cancelled) setDataUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [value, size])

  if (!dataUrl) {
    return <div className={className} style={{ width: size, height: size }} />
  }

  // eslint-disable-next-line @next/next/no-img-element -- data: URI gerado em runtime, next/image não se aplica (mesmo padrão do QR do Pix em PublicMenuClient.tsx)
  return <img src={dataUrl} alt="QR Code" className={className} width={size} height={size} />
}
