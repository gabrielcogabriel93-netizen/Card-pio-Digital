import { describe, it, expect } from 'vitest'
import { isThirdPartyNoise } from './thirdPartyErrors'

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
