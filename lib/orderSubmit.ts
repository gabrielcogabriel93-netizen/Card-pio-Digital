// Envio do pedido com nova tentativa quando a internet do cliente falha.
// O mesmo request_id vai em todas as tentativas: se a primeira chegou a
// gravar o pedido, o servidor devolve o mesmo pedido (migration 062).

const NETWORK_ERROR = /Failed to fetch|NetworkError|Load failed|Network request failed|fetch failed|ERR_INTERNET|ERR_NETWORK/i

export const isNetworkError = (message: string | null | undefined) => NETWORK_ERROR.test(message || '')

export function newRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16))
}

type RpcResult = { data: unknown; error: { message: string } | null }

export async function placeOrderWithRetry(
  call: () => PromiseLike<RpcResult>,
  { retries = 2, wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) } = {},
): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    let res: RpcResult
    try {
      res = await call()
    } catch (e) {
      const message = (e as Error)?.message
      if (!isNetworkError(message) || attempt >= retries) throw e
      await wait(1500 * (attempt + 1))
      continue
    }
    if (!res.error) return res.data
    if (isNetworkError(res.error.message) && attempt < retries) {
      await wait(1500 * (attempt + 1))
      continue
    }
    throw new Error(res.error.message)
  }
}
