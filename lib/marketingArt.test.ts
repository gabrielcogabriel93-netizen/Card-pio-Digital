import { describe, expect, it } from 'vitest'
import QRCode from 'qrcode'
import { rgbToHex } from './marketingArt'
import { generateColorShades } from './theme'

describe('rgbToHex', () => {
  it('converte a cor da rampa para o formato que o QR Code aceita', () => {
    expect(rgbToHex('rgb(23,23,23)')).toBe('#171717')
    expect(rgbToHex('rgb(35, 64, 224)')).toBe('#2340e0')
    expect(rgbToHex('#ffffff')).toBe('#ffffff')
  })

  it('o QR Code gera sem erro com a cor escura de qualquer loja', async () => {
    for (const color of [null, '#22c55e', '#000000', '#ff0000', '#FFD43B']) {
      const dark = `rgb(${generateColorShades(color)[800].split(' ').join(',')})`
      await expect(QRCode.toString('https://x.com', { type: 'svg', color: { dark: rgbToHex(dark), light: '#ffffff' } })).resolves.toContain('<svg')
    }
    await expect(QRCode.toString('https://x.com', { type: 'svg', color: { dark: 'rgb(23,23,23)' } })).rejects.toThrow(/Invalid hex color/)
  })
})
