// Sons de aviso com Web Audio API (sem arquivo externo).

let sharedContext: AudioContext | null = null

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
  if (!AudioContextClass) return null
  if (!sharedContext) sharedContext = new AudioContextClass()
  return sharedContext
}

/** O navegador só libera áudio depois de um toque na página. */
export function isAudioBlocked(): boolean {
  const ctx = getContext()
  return !!ctx && ctx.state === 'suspended'
}

/** Chamar dentro de um clique para liberar o som (ex: botão "Ativar som"). */
export async function unlockAudio(): Promise<boolean> {
  const ctx = getContext()
  if (!ctx) return false
  try {
    await ctx.resume()
    return ctx.state === 'running'
  } catch {
    return false
  }
}

/** Bipe curto de dois tons. */
export function playNotificationSound() {
  const ctx = getContext()
  if (!ctx || ctx.state !== 'running') return
  try {
    const now = ctx.currentTime
    ;[880, 1108, 1318].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = freq
      osc.type = 'triangle'
      const start = now + i * 0.14
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.5, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.32)
    })
  } catch {
    // não crítico
  }
}

let alarmTimer: ReturnType<typeof setInterval> | null = null

/**
 * Campainha de pedido novo: toca a cada 3s até stopAlarm(). Quem atende
 * nem sempre está olhando a tela; um bipe único passava despercebido.
 */
export function startAlarm() {
  if (alarmTimer) return
  playNotificationSound()
  alarmTimer = setInterval(playNotificationSound, 3000)
}

export function stopAlarm() {
  if (alarmTimer) clearInterval(alarmTimer)
  alarmTimer = null
}
