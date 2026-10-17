'use client'

import QRCode from 'qrcode'
import { generateColorShades } from './theme'

// Artes de divulgação desenhadas em <canvas> com a marca DA LOJA (cor,
// logo, nome) e o QR Code do cardápio. Saem em PNG pronto para imprimir
// ou postar, sem depender de programa de design.

export type ArtKind = 'tent' | 'sticker' | 'post' | 'story'

export interface ArtInput {
  kind: ArtKind
  storeName: string
  url: string
  themeColor: string | null | undefined
  logoUrl?: string | null
  headline: string
  subline: string
  tableLabel?: string
}

export const ART_SIZES: Record<ArtKind, { w: number; h: number; label: string }> = {
  tent: { w: 1240, h: 1754, label: 'Display de mesa (A5)' },
  sticker: { w: 1200, h: 1200, label: 'Adesivo de sacola' },
  post: { w: 1080, h: 1350, label: 'Post do Instagram' },
  story: { w: 1080, h: 1920, label: 'Story / status' },
}

const rgb = (t: string) => `rgb(${t.split(' ').join(',')})`

// A biblioteca do QR Code só aceita cor em hex ("#rrggbb").
export function rgbToHex(color: string): string {
  const parts = color.match(/\d+/g)
  if (!color.startsWith('rgb') || !parts || parts.length < 3) return color
  return '#' + parts.slice(0, 3).map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('')
}

function cssFont(variable: string, fallback: string) {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
  return value ? `${value}, ${fallback}` : fallback
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, align: CanvasTextAlign = 'left') {
  ctx.textAlign = align
  const lines = wrapLines(ctx, text, maxWidth)
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight))
  return y + lines.length * lineHeight
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// QR com correção de erro alta, para caber o logo da loja no centro.
async function drawQr(ctx: CanvasRenderingContext2D, url: string, x: number, y: number, size: number, logo: HTMLImageElement | null, dark: string) {
  const qrCanvas = document.createElement('canvas')
  await QRCode.toCanvas(qrCanvas, url, { errorCorrectionLevel: 'H', margin: 1, width: size, color: { dark: rgbToHex(dark), light: '#ffffff' } })
  ctx.fillStyle = '#ffffff'
  roundRect(ctx, x - size * 0.06, y - size * 0.06, size * 1.12, size * 1.12, size * 0.08)
  ctx.fill()
  ctx.drawImage(qrCanvas, x, y, size, size)
  if (logo) {
    const s = size * 0.22
    ctx.fillStyle = '#ffffff'
    roundRect(ctx, x + size / 2 - s / 2 - 10, y + size / 2 - s / 2 - 10, s + 20, s + 20, 18)
    ctx.fill()
    ctx.save()
    roundRect(ctx, x + size / 2 - s / 2, y + size / 2 - s / 2, s, s, 14)
    ctx.clip()
    ctx.drawImage(logo, x + size / 2 - s / 2, y + size / 2 - s / 2, s, s)
    ctx.restore()
  }
}

function drawLogoBadge(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null, name: string, x: number, y: number, size: number, color: string, display: string) {
  ctx.fillStyle = '#ffffff'
  roundRect(ctx, x, y, size, size, size * 0.22)
  ctx.fill()
  if (logo) {
    ctx.save()
    roundRect(ctx, x, y, size, size, size * 0.22)
    ctx.clip()
    ctx.drawImage(logo, x, y, size, size)
    ctx.restore()
  } else {
    ctx.fillStyle = color
    ctx.font = `800 ${size * 0.55}px ${display}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(name.charAt(0).toUpperCase(), x + size / 2, y + size / 2 + 4)
    ctx.textBaseline = 'alphabetic'
  }
}

export async function drawArt(canvas: HTMLCanvasElement, input: ArtInput): Promise<void> {
  const { w, h } = ART_SIZES[input.kind]
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const shades = generateColorShades(input.themeColor)
  const main = rgb(shades[500])
  const dark = rgb(shades[800])
  const light = rgb(shades[50])
  const display = cssFont('--font-display', 'Arial Black, sans-serif')
  const body = cssFont('--font-body', 'Arial, sans-serif')
  const logo = input.logoUrl ? await loadImage(input.logoUrl) : null
  const shortUrl = input.url.replace(/^https?:\/\//, '')

  if (input.kind === 'tent') {
    ctx.fillStyle = main
    ctx.fillRect(0, 0, w, h)
    drawLogoBadge(ctx, logo, input.storeName, w / 2 - 110, 120, 220, main, display)
    ctx.fillStyle = '#ffffff'
    ctx.font = `800 64px ${display}`
    drawText(ctx, input.storeName, w / 2, 430, w - 200, 74, 'center')
    ctx.font = `800 120px ${display}`
    const after = drawText(ctx, input.headline, w / 2, 640, w - 160, 128, 'center')
    await drawQr(ctx, input.url, w / 2 - 280, after + 40, 560, logo, dark)
    if (input.tableLabel) {
      ctx.fillStyle = '#FFD43B'
      roundRect(ctx, w / 2 - 170, after + 680, 340, 96, 22)
      ctx.fill()
      ctx.fillStyle = '#14172B'
      ctx.font = `800 56px ${display}`
      ctx.textAlign = 'center'
      ctx.fillText(input.tableLabel.toUpperCase(), w / 2, after + 748)
    }
    ctx.fillStyle = '#ffffff'
    ctx.font = `500 40px ${body}`
    drawText(ctx, input.subline, w / 2, h - 170, w - 200, 52, 'center')
    ctx.font = `600 34px ${body}`
    ctx.globalAlpha = 0.85
    drawText(ctx, shortUrl, w / 2, h - 70, w - 160, 40, 'center')
    ctx.globalAlpha = 1
    return
  }

  if (input.kind === 'sticker') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.beginPath()
    ctx.arc(w / 2, h / 2, w / 2 - 20, 0, Math.PI * 2)
    ctx.fillStyle = light
    ctx.fill()
    ctx.lineWidth = 36
    ctx.strokeStyle = main
    ctx.stroke()
    ctx.fillStyle = dark
    ctx.font = `800 76px ${display}`
    const after = drawText(ctx, input.headline, w / 2, 260, 760, 84, 'center')
    await drawQr(ctx, input.url, w / 2 - 210, after + 20, 420, logo, dark)
    ctx.fillStyle = dark
    ctx.font = `600 40px ${body}`
    drawText(ctx, input.subline, w / 2, after + 520, 760, 48, 'center')
    return
  }

  // post e story
  const grad = ctx.createLinearGradient(0, 0, w, h)
  grad.addColorStop(0, main)
  grad.addColorStop(1, dark)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
  const pad = 90
  drawLogoBadge(ctx, logo, input.storeName, pad, pad, 150, main, display)
  ctx.fillStyle = '#ffffff'
  ctx.font = `700 48px ${display}`
  ctx.textAlign = 'left'
  ctx.fillText(input.storeName, pad + 180, pad + 92)

  const headlineSize = input.kind === 'story' ? 128 : 112
  ctx.font = `800 ${headlineSize}px ${display}`
  const top = input.kind === 'story' ? 520 : 400
  const after = drawText(ctx, input.headline, pad, top, w - pad * 2, headlineSize * 1.02)
  ctx.font = `500 46px ${body}`
  ctx.globalAlpha = 0.92
  const afterSub = drawText(ctx, input.subline, pad, after + 30, w - pad * 2, 58)
  ctx.globalAlpha = 1

  if (input.kind === 'story') {
    await drawQr(ctx, input.url, w / 2 - 230, afterSub + 80, 460, logo, dark)
  }

  // Botão "Peça aqui"
  const btnY = h - pad - 130
  ctx.fillStyle = '#FFD43B'
  roundRect(ctx, pad, btnY, w - pad * 2, 130, 34)
  ctx.fill()
  ctx.fillStyle = '#14172B'
  ctx.font = `800 54px ${display}`
  ctx.textAlign = 'center'
  ctx.fillText('Peça aqui →', w / 2, btnY + 64)
  ctx.font = `600 32px ${body}`
  ctx.fillText(shortUrl, w / 2, btnY + 108)
}
