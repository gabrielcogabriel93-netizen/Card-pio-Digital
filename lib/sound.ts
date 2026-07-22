/**
 * Toca um bipe curto (dois tons) usando Web Audio API — sem depender de
 * nenhum arquivo de áudio externo. Usado para avisar de pedido novo na
 * tela de Pedidos, já que nem sempre quem atende está olhando a tela.
 */
export function playNotificationSound() {
  if (typeof window === 'undefined') return
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()
    const now = ctx.currentTime

    ;[880, 1108].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = freq
      osc.type = 'sine'
      const start = now + i * 0.16
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.3)
    })

    setTimeout(() => ctx.close(), 700)
  } catch {
    // Navegadores podem bloquear áudio antes de qualquer interação do
    // usuário na página — silenciosamente ignora, não é crítico.
  }
}
