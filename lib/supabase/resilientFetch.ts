// fetch usado pelos clientes do Supabase. Logo depois que o login é
// renovado, o banco às vezes recusa o token por alguns segundos com
// "JWT issued at future" (relógios do servidor de login e do banco
// levemente diferentes). Antes isso fazia o painel achar que a loja não
// existia. Agora a chamada espera um pouco e tenta de novo, sozinha.
const TRANSIENT_AUTH = /issued at future|PGRST303/i
const MAX_RETRIES = 2

export function isTransientAuthError(message: string | null | undefined): boolean {
  return TRANSIENT_AUTH.test(message || '')
}

export const resilientFetch: typeof fetch = async (input, init) => {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(input, init)
    if (response.status !== 401 || attempt >= MAX_RETRIES) return response
    const text = await response.clone().text().catch(() => '')
    if (!isTransientAuthError(text)) return response
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)))
  }
}
