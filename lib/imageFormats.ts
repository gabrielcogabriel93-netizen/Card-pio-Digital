// Formatos padrão das imagens do cardápio. Toda foto passa pelo recorte
// (components/ImageCropper) e sai exatamente neste tamanho, para o
// cardápio ficar harmonioso: mesma proporção em todos os pratos.

export type ImageFolder = 'products' | 'logo' | 'pizza-flavors' | 'combos' | 'banners'

export interface ImageFormat {
  width: number
  height: number
  label: string     // "1200 × 900 px"
  ratioLabel: string // "4:3"
  tip: string
  keepTransparency?: boolean
}

export const IMAGE_FORMATS: Record<ImageFolder, ImageFormat> = {
  products: { width: 1200, height: 900, label: '1200 × 900 px', ratioLabel: '4:3', tip: 'Foto do prato de cima ou levemente inclinada, com o prato no centro e luz natural.' },
  combos: { width: 1200, height: 900, label: '1200 × 900 px', ratioLabel: '4:3', tip: 'Mostre os itens do combo juntos, com o principal no centro.' },
  'pizza-flavors': { width: 1200, height: 900, label: '1200 × 900 px', ratioLabel: '4:3', tip: 'Pizza inteira vista de cima, centralizada.' },
  logo: { width: 512, height: 512, label: '512 × 512 px', ratioLabel: 'quadrado', tip: 'Logo centralizado, com um pouco de respiro nas bordas. Fundo transparente (PNG) fica melhor.', keepTransparency: true },
  banners: { width: 1600, height: 600, label: '1600 × 600 px', ratioLabel: '8:3', tip: 'Deixe textos e produto no centro: nas laterais o banner pode ser cortado em telas pequenas.' },
}

/** Recorte "cobrir" (cover): área da imagem original que vai para a saída. */
export function coverCrop(imgW: number, imgH: number, frameW: number, frameH: number, zoom: number, offsetX: number, offsetY: number) {
  const scale = Math.max(frameW / imgW, frameH / imgH) * zoom
  const maxX = 0
  const minX = frameW - imgW * scale
  const maxY = 0
  const minY = frameH - imgH * scale
  const x = Math.min(maxX, Math.max(minX, offsetX))
  const y = Math.min(maxY, Math.max(minY, offsetY))
  return { scale, x, y, sx: (0 - x) / scale, sy: (0 - y) / scale, sw: frameW / scale, sh: frameH / scale }
}
