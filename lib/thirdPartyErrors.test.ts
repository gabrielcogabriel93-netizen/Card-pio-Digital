import { describe, it, expect } from 'vitest'
import { isBotUserAgent, isThirdPartyNoise } from './thirdPartyErrors'

describe('erros de terceiros', () => {
  it('ignora o script injetado pelo navegador do Instagram', () => {
    expect(isThirdPartyNoise({
      message: "undefined is not an object (evaluating 'window._META.IABInnerFrame')",
      stack: '@https://card-pio-digital-hazel.vercel.app/:1:51\nglobal code@https://card-pio-digital-hazel.vercel.app/:1:136',
    })).toBe(true)
  })

  it('ignora extensões, "Script error." opaco e ruídos do iOS/Chrome', () => {
    expect(isThirdPartyNoise({ message: 'x is undefined', stack: 'at chrome-extension://abc/content.js:1:1' })).toBe(true)
    expect(isThirdPartyNoise({ message: 'Script error.' })).toBe(true)
    expect(isThirdPartyNoise({ message: "Can't find variable: __gCrWeb" })).toBe(true)
    expect(isThirdPartyNoise({ message: 'ResizeObserver loop completed with undelivered notifications.' })).toBe(true)
  })

  it('erro de verdade do app continua sendo registrado', () => {
    expect(isThirdPartyNoise({ message: "Cannot read properties of undefined (reading 'items')", stack: 'at PublicMenuClient (/_next/static/chunks/app.js:1:2)' })).toBe(false)
    expect(isThirdPartyNoise({ message: 'Script error.', filename: 'https://card-pio-digital-hazel.vercel.app/_next/static/chunks/main.js' })).toBe(false)
  })
})

describe('robôs não entram nos logs', () => {
  it('reconhece os robôs de anúncio, busca e prévia de link', () => {
    expect(isBotUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 (compatible; meta-externalads/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler))')).toBe(true)
    expect(isBotUserAgent('facebookexternalhit/1.1')).toBe(true)
    expect(isBotUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe(true)
    expect(isBotUserAgent('WhatsApp/2.23.20.0')).toBe(true)
  })
  it('não confunde cliente de verdade (nem celular Cubot)', () => {
    expect(isBotUserAgent('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Mobile Safari/537.36')).toBe(false)
    expect(isBotUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 27_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/157.0 Mobile/15E148 Safari/604.1')).toBe(false)
    expect(isBotUserAgent('Mozilla/5.0 (Linux; Android 11; Cubot KingKong 5) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36')).toBe(false)
    expect(isBotUserAgent(null)).toBe(false)
  })
})
