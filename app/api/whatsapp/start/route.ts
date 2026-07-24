import { NextRequest, NextResponse } from 'next/server'
import { verifyEstablishmentOwner } from '@/lib/verifyEstablishmentOwner'
import { whatsappServer } from '@/lib/whatsappServer'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  let body: { establishment_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const establishmentId = body.establishment_id || ''
  if (!(await verifyEstablishmentOwner(establishmentId))) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const data = await whatsappServer.start(establishmentId)
    return NextResponse.json(data)
  } catch (err: any) {
    logError('api:whatsapp:start', 'erro ao iniciar sessão', err)
    return NextResponse.json({ error: err.message || 'Erro ao iniciar sessão' }, { status: 502 })
  }
}
