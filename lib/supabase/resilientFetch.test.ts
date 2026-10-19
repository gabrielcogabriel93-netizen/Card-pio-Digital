import { afterEach, describe, expect, it, vi } from 'vitest'
import { resilientFetch } from './resilientFetch'

const res = (status: number, body: string) => new Response(body, { status })

describe('resilientFetch', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('tenta de novo quando o banco recusa o token "do futuro"', async () => {
    vi.useFakeTimers()
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(res(401, '{"code":"PGRST303","message":"JWT issued at future"}'))
      .mockResolvedValueOnce(res(200, '[{"id":1}]'))
    const pending = resilientFetch('https://x/rest/v1/establishments')
    await vi.advanceTimersByTimeAsync(1600)
    const r = await pending
    expect(r.status).toBe(200)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('desiste depois de 2 novas tentativas', async () => {
    vi.useFakeTimers()
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => res(401, 'JWT issued at future'))
    const pending = resilientFetch('https://x')
    await vi.advanceTimersByTimeAsync(5000)
    expect((await pending).status).toBe(401)
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('não repete erro de verdade (sem permissão, senha errada)', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(res(401, '{"message":"Invalid login credentials"}'))
    expect((await resilientFetch('https://x')).status).toBe(401)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
