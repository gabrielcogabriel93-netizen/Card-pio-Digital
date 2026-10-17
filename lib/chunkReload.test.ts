import { describe, expect, it } from 'vitest'
import { isChunkLoadError } from './chunkReload'

describe('isChunkLoadError', () => {
  it('reconhece arquivo JS de versão antiga', () => {
    expect(isChunkLoadError(new Error('Loading chunk 3200 failed.\n(error: https://x/_next/static/chunks/app/offline/page-31e3.js)'))).toBe(true)
    expect(isChunkLoadError({ name: 'ChunkLoadError', message: '' })).toBe(true)
    expect(isChunkLoadError(new Error('Loading CSS chunk 12 failed.'))).toBe(true)
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/a.js'))).toBe(true)
  })

  it('não confunde com erro de verdade', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
  })
})
