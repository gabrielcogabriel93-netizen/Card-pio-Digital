// Depois de um deploy, quem estava com o app aberto pede arquivos JS da
// versão anterior, que já não existem ("Loading chunk 123 failed"). Não é
// defeito do código: recarregar a página busca a versão nova. Recarrega
// no máximo uma vez a cada 30 s para nunca entrar em laço.
const KEY = 'fregues:chunk-reload-at'

export function isChunkLoadError(error: unknown): boolean {
  const e = error as { name?: string; message?: string } | null
  return !!e && (e.name === 'ChunkLoadError' || /Loading (CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module/i.test(e.message || ''))
}

export function reloadOnceForChunkError(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0)
    if (Date.now() - last < 30_000) return false
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    return false
  }
  window.location.reload()
  return true
}
