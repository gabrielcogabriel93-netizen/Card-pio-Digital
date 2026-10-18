import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { clientIp } from '@/lib/ownerStore'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Clique numa notificação da loja (chamado pelo service worker). Conta
// no máximo um clique por IP por campanha, para o número ser honesto.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const id = String(body?.campaign_id || '')
  if (!UUID.test(id)) return NextResponse.json({ ok: false }, { status: 400 })

  const admin = createAdminClient()
  const { data: allowed } = await admin.rpc('check_rate_limit', {
    p_scope: 'push_click',
    p_key: `${clientIp(request.headers)}:${id}`,
    p_max_count: 1,
    p_window: '1 day',
  })
  if (allowed) await admin.rpc('register_push_click', { p_campaign_id: id })
  return NextResponse.json({ ok: true })
}
