import { describe, it, expect } from 'vitest'
import { isNetworkError, placeOrderWithRetry } from './orderSubmit'

const noWait = { wait: async () => {} }

describe('envio do pedido', () => {
  it('reconhece queda de internet nos navegadores comuns', () => {
    expect(isNetworkError('TypeError: Failed to fetch')).toBe(true)
    expect(isNetworkError('Load failed')).toBe(true)
    expect(isNetworkError('NetworkError when attempting to fetch resource.')).toBe(true)
    expect(isNetworkError('A loja está fechada agora.')).toBe(false)
  })

  it('internet caiu e voltou: tenta de novo e devolve o pedido', async () => {
    let calls = 0
    const r = await placeOrderWithRetry(async () => {
      calls++
      if (calls === 1) throw new TypeError('Failed to fetch')
      if (calls === 2) return { data: null, error: { message: 'TypeError: Failed to fetch' } }
      return { data: { order_id: 'x' }, error: null }
    }, noWait)
    expect(r).toEqual({ order_id: 'x' })
    expect(calls).toBe(3)
  })

  it('erro de regra do servidor não repete', async () => {
    let calls = 0
    await expect(placeOrderWithRetry(async () => { calls++; return { data: null, error: { message: 'A loja está fechada agora.' } } }, noWait)).rejects.toThrow(/fechada/)
    expect(calls).toBe(1)
  })

  it('sem internet nenhuma: desiste depois de 3 tentativas', async () => {
    let calls = 0
    await expect(placeOrderWithRetry(async () => { calls++; throw new TypeError('Failed to fetch') }, noWait)).rejects.toThrow(/Failed to fetch/)
    expect(calls).toBe(3)
  })
})
