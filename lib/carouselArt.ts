'use client'

// Desenha as lâminas do carrossel (1080 x 1350, retrato do feed) com a marca
// da loja: cor, logo, fotos dos produtos e o QR Code do cardápio no final.
import { generateColorShades } from './theme'
import { cssFont, drawCover, drawLogoBadge, drawQr, drawText, loadImage, rgb, roundRect, wrapLines } from './marketingArt'
import type { Slide } from './carousels'

export const SLIDE_W = 1080
export const SLIDE_H = 1350

export interface SlideBrand {
  storeName: string
  url: string
  themeColor: string | null | undefined
  logoUrl?: string | null
}

const images = new Map<string, Promise<HTMLImageElement | null>>()
const img = (src?: string | null) => {
  if (!src) return Promise.resolve(null)
  if (!images.has(src)) images.set(src, loadImage(src))
  return images.get(src)!
}

function fitText(ctx: CanvasRenderingContext2D, text: string, weight: number, family: string, start: number, maxWidth: number, maxLines: number): number {
  let size = start
  for (; size > 34; size -= 4) {
    ctx.font = `${weight} ${size}px ${family}`
    if (wrapLines(ctx, text, maxWidth).length <= maxLines) break
  }
  return size
}

export async function drawSlide(canvas: HTMLCanvasElement, slide: Slide, brand: SlideBrand, position: { index: number; total: number }): Promise<void> {
  canvas.width = SLIDE_W
  canvas.height = SLIDE_H
  const ctx = canvas.getContext('2d')!
  const shades = generateColorShades(brand.themeColor)
  const main = rgb(shades[500])
  const dark = rgb(shades[900] || shades[800])
  const soft = rgb(shades[50])
  const display = cssFont('--font-display', 'Arial Black, sans-serif')
  const body = cssFont('--font-sans', 'Arial, sans-serif')
  const logo = await img(brand.logoUrl)
  const W = SLIDE_W, H = SLIDE_H, M = 80
  const last = position.index === position.total - 1
  const onColor = slide.type === 'cover' || slide.type === 'cta' || slide.type === 'big'

  // Fundo
  if (onColor) {
    const g = ctx.createLinearGradient(0, 0, W, H)
    g.addColorStop(0, main)
    g.addColorStop(1, dark)
    ctx.fillStyle = g
  } else {
    ctx.fillStyle = soft
  }
  ctx.fillRect(0, 0, W, H)
  const ink = onColor ? '#ffffff' : '#14172B'
  const muted = onColor ? 'rgba(255,255,255,0.82)' : '#5A6078'

  if (slide.type === 'cover') {
    const photo = await img(slide.image)
    if (photo) {
      ctx.save()
      roundRect(ctx, M, 250, W - M * 2, 560, 48)
      ctx.clip()
      drawCover(ctx, photo, M, 250, W - M * 2, 560)
      ctx.restore()
    }
    let y = photo ? 900 : 420
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.font = `700 34px ${body}`
    const eyebrowW = ctx.measureText(slide.eyebrow.toUpperCase()).width + 56
    roundRect(ctx, M, y - 52, eyebrowW, 68, 34)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'left'
    ctx.fillText(slide.eyebrow.toUpperCase(), M + 28, y - 6)
    y += 80
    const size = fitText(ctx, slide.title, 800, display, photo ? 84 : 110, W - M * 2, photo ? 3 : 4)
    ctx.font = `800 ${size}px ${display}`
    ctx.fillStyle = '#ffffff'
    y = drawText(ctx, slide.title, M, y, W - M * 2, size * 1.08)
    if (slide.subtitle) {
      ctx.font = `500 40px ${body}`
      ctx.fillStyle = muted
      drawText(ctx, slide.subtitle, M, y + 20, W - M * 2, 52)
    }
  }

  if (slide.type === 'product') {
    const photo = await img(slide.image)
    ctx.save()
    roundRect(ctx, M, 130, W - M * 2, 620, 48)
    ctx.clip()
    if (photo) drawCover(ctx, photo, M, 130, W - M * 2, 620)
    else {
      const g = ctx.createLinearGradient(M, 130, W - M, 750)
      g.addColorStop(0, rgb(shades[200]))
      g.addColorStop(1, rgb(shades[400]))
      ctx.fillStyle = g
      ctx.fillRect(M, 130, W - M * 2, 620)
    }
    ctx.restore()
    if (slide.index) {
      ctx.fillStyle = main
      roundRect(ctx, M + 30, 160, 150, 110, 30)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.font = `800 70px ${display}`
      ctx.textAlign = 'center'
      ctx.fillText(slide.index, M + 105, 240)
    }
    if (slide.badge) {
      ctx.font = `800 52px ${display}`
      const bw = ctx.measureText(slide.badge).width + 60
      ctx.fillStyle = '#FFD43B'
      roundRect(ctx, W - M - 30 - bw, 160, bw, 96, 28)
      ctx.fill()
      ctx.fillStyle = '#14172B'
      ctx.textAlign = 'center'
      ctx.fillText(slide.badge, W - M - 30 - bw / 2, 226)
    }
    let y = 840
    const size = fitText(ctx, slide.name, 800, display, 72, W - M * 2, 2)
    ctx.font = `800 ${size}px ${display}`
    ctx.fillStyle = ink
    y = drawText(ctx, slide.name, M, y, W - M * 2, size * 1.1)
    if (slide.description) {
      ctx.font = `400 34px ${body}`
      ctx.fillStyle = muted
      const lines = wrapLines(ctx, slide.description, W - M * 2).slice(0, 2)
      lines.forEach((l, i) => ctx.fillText(l, M, y + i * 44))
      y += lines.length * 44
    }
    // Preço sempre acima do rodapé (marca da loja).
    y = Math.min(y + 80, H - 190)
    ctx.textAlign = 'left'
    if (slide.oldPrice) {
      ctx.font = `600 44px ${body}`
      ctx.fillStyle = '#8A90A8'
      const t = `de ${slide.oldPrice}`
      ctx.fillText(t, M, y)
      const tw = ctx.measureText(t).width
      ctx.fillRect(M, y - 15, tw, 4)
      ctx.font = `800 80px ${display}`
      ctx.fillStyle = '#0B8A5F'
      ctx.fillText(`por ${slide.price}`, M + tw + 30, y + 6)
    } else {
      ctx.font = `800 80px ${display}`
      ctx.fillStyle = main
      ctx.fillText(slide.price, M, y + 6)
    }
  }

  if (slide.type === 'big') {
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(255,255,255,0.82)'
    ctx.font = `700 42px ${body}`
    ctx.fillText(slide.eyebrow.toUpperCase(), W / 2, 360)
    // "Ingresso" tracejado para o código
    const size = fitText(ctx, slide.big, 900, display, 190, W - M * 2 - 120, 1)
    ctx.fillStyle = '#ffffff'
    roundRect(ctx, M, 430, W - M * 2, 330, 48)
    ctx.fill()
    ctx.setLineDash([22, 16])
    ctx.lineWidth = 6
    ctx.strokeStyle = main
    roundRect(ctx, M + 26, 456, W - M * 2 - 52, 278, 34)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = dark
    ctx.font = `900 ${size}px ${display}`
    ctx.fillText(slide.big, W / 2, 595 + size * 0.35)
    ctx.fillStyle = '#ffffff'
    const ts = fitText(ctx, slide.title, 800, display, 76, W - M * 2, 2)
    ctx.font = `800 ${ts}px ${display}`
    const y = drawText(ctx, slide.title, W / 2, 900, W - M * 2, ts * 1.1, 'center')
    if (slide.subtitle) {
      ctx.font = `500 40px ${body}`
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      drawText(ctx, slide.subtitle, W / 2, y + 30, W - M * 2, 52, 'center')
    }
  }

  if (slide.type === 'list' || slide.type === 'steps') {
    ctx.textAlign = 'left'
    const title = slide.title
    const ts = fitText(ctx, title, 800, display, 84, W - M * 2, 2)
    ctx.font = `800 ${ts}px ${display}`
    ctx.fillStyle = ink
    let y = drawText(ctx, title, M, 260, W - M * 2, ts * 1.1) + 50
    const items = slide.type === 'list' ? slide.items : slide.steps
    // Cabe tudo acima do rodapé, qualquer que seja a quantidade de itens.
    const step = Math.min(175, (H - 190 - y) / Math.max(1, items.length))
    const boxH = step - 22
    const mid = boxH / 2
    for (let i = 0; i < items.length; i++) {
      ctx.fillStyle = '#ffffff'
      roundRect(ctx, M, y, W - M * 2, boxH, 36)
      ctx.fill()
      ctx.fillStyle = main
      ctx.beginPath()
      ctx.arc(M + 80, y + mid, Math.min(44, mid - 14), 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.font = `800 46px ${display}`
      ctx.textAlign = 'center'
      ctx.fillText(slide.type === 'steps' ? String(i + 1) : '✓', M + 80, y + mid + 16)
      ctx.textAlign = 'left'
      ctx.fillStyle = '#14172B'
      ctx.font = `600 40px ${body}`
      const lines = wrapLines(ctx, items[i], W - M * 2 - 190).slice(0, 2)
      const top = y + mid - ((lines.length - 1) * 50) / 2 + 14
      lines.forEach((l, k) => ctx.fillText(l, M + 160, top + k * 50))
      y += step
    }
  }

  if (slide.type === 'cta') {
    ctx.textAlign = 'center'
    drawLogoBadge(ctx, logo, brand.storeName, W / 2 - 90, 150, 180, main, display)
    const ts = fitText(ctx, slide.title, 800, display, 86, W - M * 2, 2)
    ctx.font = `800 ${ts}px ${display}`
    ctx.fillStyle = '#ffffff'
    const y = drawText(ctx, slide.title, W / 2, 440, W - M * 2, ts * 1.08, 'center')
    await drawQr(ctx, brand.url, W / 2 - 200, y + 40, 400, logo, rgb(shades[800]))
    ctx.font = `500 38px ${body}`
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    drawText(ctx, slide.subtitle, W / 2, y + 560, W - M * 2, 50, 'center')
  }

  // Rodapé: marca + posição + "arraste"
  ctx.textAlign = 'left'
  if (slide.type !== 'cta') {
    drawLogoBadge(ctx, logo, brand.storeName, M, H - 130, 70, main, display)
    ctx.font = `700 34px ${body}`
    ctx.fillStyle = ink
    ctx.fillText(brand.storeName.slice(0, 26), M + 92, H - 83)
  }
  ctx.font = `700 30px ${body}`
  ctx.fillStyle = muted
  ctx.textAlign = 'right'
  ctx.fillText(last ? `${position.index + 1}/${position.total}` : `${position.index + 1}/${position.total}  arraste →`, W - M, H - 83)
}

/** PNG de cada lâmina, prontos para compartilhar. */
export async function slidesToFiles(canvases: HTMLCanvasElement[], baseName: string): Promise<File[]> {
  const files: File[] = []
  for (let i = 0; i < canvases.length; i++) {
    const blob = await new Promise<Blob | null>((r) => canvases[i].toBlob(r, 'image/jpeg', 0.92))
    if (!blob) throw new Error('não foi possível gerar a imagem')
    files.push(new File([blob], `${baseName}-${String(i + 1).padStart(2, '0')}.jpg`, { type: 'image/jpeg' }))
  }
  return files
}
