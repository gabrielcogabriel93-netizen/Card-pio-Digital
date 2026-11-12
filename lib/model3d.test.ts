import { describe, it, expect } from 'vitest'
import { checkModelHeader, isSafeModelUrl, modelFileProblem, modelKindOf, MODEL_MAX_BYTES } from './model3d'

const GLB = new Uint8Array([0x67, 0x6c, 0x54, 0x46])
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04])

describe('arquivo do prato em 3D', () => {
  it('reconhece GLB e USDZ pela extensão e pela assinatura', () => {
    expect(modelKindOf('Prato.GLB')).toBe('glb')
    expect(modelKindOf('prato.usdz')).toBe('usdz')
    expect(modelKindOf('prato.obj')).toBeNull()
    expect(checkModelHeader('glb', GLB)).toBe(true)
    expect(checkModelHeader('glb', ZIP)).toBe(false)
    expect(checkModelHeader('usdz', ZIP)).toBe(true)
  })

  it('explica o problema em português', () => {
    expect(modelFileProblem({ name: 'a.glb', size: 1000 }, GLB, 'glb')).toBeNull()
    expect(modelFileProblem({ name: 'a.obj', size: 1000 }, GLB, 'glb')).toMatch(/\.glb/)
    expect(modelFileProblem({ name: 'a.usdz', size: 1000 }, ZIP, 'glb')).toMatch(/campo próprio/)
    expect(modelFileProblem({ name: 'a.glb', size: MODEL_MAX_BYTES + 1 }, GLB, 'glb')).toMatch(/limite/)
    expect(modelFileProblem({ name: 'a.glb', size: 1000 }, ZIP, 'glb')).toMatch(/válido/)
  })

  it('só aceita endereço https', () => {
    expect(isSafeModelUrl('https://x.supabase.co/a.glb')).toBe(true)
    expect(isSafeModelUrl('http://x/a.glb')).toBe(false)
    expect(isSafeModelUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeModelUrl(null)).toBe(false)
  })
})
