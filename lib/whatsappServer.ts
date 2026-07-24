// Cliente do servidor WPPConnect (whatsapp-server/), chamado só de
// rotas de servidor (app/api/whatsapp/*) — nunca do browser, porque
// carrega WHATSAPP_SERVER_SECRET.

interface StatusResponse {
  status: 'disconnected' | 'starting' | 'qrcode' | 'connected'
  qrCode: string | null
}

async function call<T>(path: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = process.env.WHATSAPP_SERVER_URL
  const secret = process.env.WHATSAPP_SERVER_SECRET

  if (!baseUrl || !secret) {
    throw new Error('Servidor WhatsApp não configurado (WHATSAPP_SERVER_URL / WHATSAPP_SERVER_SECRET ausentes).')
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-secret': secret,
      ...(options.headers || {}),
    },
    cache: 'no-store',
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || `Erro ao chamar servidor WhatsApp (${response.status})`)
  }
  return data as T
}

export const whatsappServer = {
  status: (establishmentId: string) => call<StatusResponse>(`/sessions/${establishmentId}/status`),
  start: (establishmentId: string) => call<StatusResponse>(`/sessions/${establishmentId}/start`, { method: 'POST' }),
  logout: (establishmentId: string) => call<{ ok: boolean }>(`/sessions/${establishmentId}/logout`, { method: 'POST' }),
  send: (establishmentId: string, phone: string, message: string) =>
    call<{ ok: boolean }>(`/sessions/${establishmentId}/send`, {
      method: 'POST',
      body: JSON.stringify({ phone, message }),
    }),
}
