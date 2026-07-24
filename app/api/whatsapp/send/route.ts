import { NextRequest, NextResponse } from 'next/server'
import { verifyEstablishmentOwner } from '@/lib/verifyEstablishmentOwner'
import { whatsappServer } from '@/lib/whatsappServer'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'

// Envio SEMPRE 1 pra 1, disparado por uma ação manual do lojista (mudar
// status de UM pedido, ou clicar pra mandar parabéns pra UM cliente) —
// de propósito não existe aqui nenhum jeito de mandar pra uma lista.
export async function POST(request: NextRequest) {
  let body: { establishment_id?: string; phone?: string; message?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const establishmentId = body.establishment_id || ''
  if (!body.phone || !body.message) {
    return NextResponse.json({ error: 'phone e message são obrigatórios' }, { status: 400 })
  }
  if (!(await verifyEstablishmentOwner(establishmentId))) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const data = await whatsappServer.send(establishmentId, body.phone, body.message)
    return NextResponse.json(data)
  } catch (err: any) {
    logError('api:whatsapp:send', 'erro ao enviar mensagem', err)
    return NextResponse.json({ error: err.message || 'Erro ao enviar mensagem' }, { status: 502 })
  }
}
