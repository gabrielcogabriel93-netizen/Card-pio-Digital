import { describe, it, expect } from 'vitest'
import { generateUniqueAffiliateCode } from './divulgador'

// Fake mínimo do client do Supabase: só precisa responder à cadeia
// .from('divulgadores').select('id').eq('codigo_afiliado', X).maybeSingle()
// usada por generateUniqueAffiliateCode.
function fakeSupabase(takenCodes: string[]) {
  return {
    from: () => ({
      select: () => ({
        eq: (_column: string, value: string) => ({
          maybeSingle: async () => ({ data: takenCodes.includes(value) ? { id: 'existing' } : null }),
        }),
      }),
    }),
  } as any
}

describe('generateUniqueAffiliateCode', () => {
  const year = new Date().getFullYear()

  it('uses the base code when it is free', async () => {
    const code = await generateUniqueAffiliateCode(fakeSupabase([]), 'João Silva')
    expect(code).toBe(`JOAOSILVA${year}`)
  })

  it('appends a numeric suffix on conflict', async () => {
    const base = `JOAOSILVA${year}`
    const code = await generateUniqueAffiliateCode(fakeSupabase([base]), 'João Silva')
    expect(code).toBe(`${base}2`)
  })

  it('keeps trying suffixes until a free one is found', async () => {
    const base = `JOAOSILVA${year}`
    const taken = [base, `${base}2`, `${base}3`]
    const code = await generateUniqueAffiliateCode(fakeSupabase(taken), 'João Silva')
    expect(code).toBe(`${base}4`)
  })

  it('falls back to "DIVULGADOR" for a name with no alphanumeric characters', async () => {
    const code = await generateUniqueAffiliateCode(fakeSupabase([]), '!!!')
    expect(code).toBe(`DIVULGADOR${year}`)
  })
})
