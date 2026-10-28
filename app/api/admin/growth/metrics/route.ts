import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireGrowthAccess } from '@/lib/adminAccess'
import { loadGrowthMetrics } from '@/lib/growthData'
import { buildInsights } from '@/lib/growthInsights'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'
export const maxDuration = 60

const PERIODS = [7, 30, 90]

// Métricas das 7 áreas + parecer automático (aba Crescimento).
export async function GET(request: NextRequest) {
  const access = await requireGrowthAccess()
  if (!access) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const asked = Number(request.nextUrl.searchParams.get('period'))
  const period = PERIODS.includes(asked) ? asked : 30
  try {
    const { metrics, billingEnabled } = await loadGrowthMetrics(createAdminClient(), period)
    return NextResponse.json({ metrics, insights: buildInsights(metrics, { billingEnabled }), billingEnabled, role: access.role })
  } catch (err) {
    logError('api:admin:growth:metrics', 'erro ao calcular métricas', err)
    return NextResponse.json({ error: 'Não foi possível calcular as métricas agora.' }, { status: 500 })
  }
}
