import { NextRequest, NextResponse } from 'next/server'
import { verifyEstablishmentOwner } from '@/lib/verifyEstablishmentOwner'
import { whatsappServer } from '@/lib/whatsappServer'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const establishmentId = request.nextUrl.searchParams.get('establishment_id') || ''

  if (!(await verifyEstablishmentOwner(establishmentId))) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const data = await whatsappServer.status(establishmentId)
    return NextResponse.json(data)
  } catch (err: any) {
    logError('api:whatsapp:status', 'erro ao consultar status', err)
    return NextResponse.json({ error: err.message || 'Erro ao consultar status' }, { status: 502 })
  }
}
