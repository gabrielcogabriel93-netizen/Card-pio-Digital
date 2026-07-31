import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPlatformAdminUser } from '@/lib/platformAdmin'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'

export async function PATCH(request: NextRequest) {
  const adminUser = await getPlatformAdminUser()
  if (!adminUser) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  let body: { monthlyPrice?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const monthlyPrice = Number(body.monthlyPrice)
  if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0) {
    return NextResponse.json({ error: 'Valor inválido' }, { status: 400 })
  }

  const admin = createAdminClient()

  try {
    const { error } = await admin.from('platform_settings').update({ monthly_price: monthlyPrice }).eq('id', true)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    logError('api:admin:settings', 'erro ao atualizar valor da mensalidade', err)
    return NextResponse.json({ error: 'Erro ao atualizar valor' }, { status: 500 })
  }
}
