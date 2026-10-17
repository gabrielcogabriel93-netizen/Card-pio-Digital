// Roda uma vez quando o servidor (Node) sobe. Erro assíncrono que escapou
// de todo try/catch numa rota ou webhook também vai para a aba Logs do
// admin, não só para o console da Vercel.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { logCritical } = await import('./lib/logger')
  process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason)
    void logCritical('servidor:promise-sem-tratamento', message || 'Promise rejeitada sem tratamento', reason)
  })
  process.on('uncaughtExceptionMonitor', (error) => {
    void logCritical('servidor:excecao-sem-tratamento', error.message || 'Exceção sem tratamento', error)
  })
}
