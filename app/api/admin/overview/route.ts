import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPlatformAdminUser } from '@/lib/platformAdmin'
import { resolveSubscriptionAccess } from '@/lib/subscription'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'

export async function GET() {
  const adminUser = await getPlatformAdminUser()
  if (!adminUser) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  const admin = createAdminClient()

  try {
    const { data: settings, error: settingsError } = await admin
      .from('platform_settings')
      .select('billing_enabled, billing_enabled_at, monthly_price')
      .eq('id', true)
      .single()
    if (settingsError) throw settingsError

    const { data: establishments, error: estError } = await admin
      .from('establishments')
      .select('id, name, slug, created_at, subscription_status, trial_ends_at, current_period_end, plan_tier')
      .order('created_at', { ascending: false })
    if (estError) throw estError

    const billingEnabled = !!settings.billing_enabled
    const rows = (establishments || []).map((e) => {
      const access = resolveSubscriptionAccess({
        billingEnabled,
        status: e.subscription_status,
        trialEndsAt: e.trial_ends_at,
        currentPeriodEnd: e.current_period_end,
      })
      return {
        id: e.id,
        name: e.name,
        slug: e.slug,
        createdAt: e.created_at,
        subscriptionStatus: e.subscription_status,
        trialEndsAt: e.trial_ends_at,
        currentPeriodEnd: e.current_period_end,
        blocked: access.blocked,
        planTier: e.plan_tier === 'completo' ? 'completo' : 'essencial',
      }
    })

    const counts = {
      total: rows.length,
      trial: rows.filter((r) => r.subscriptionStatus === 'trial').length,
      active: rows.filter((r) => r.subscriptionStatus === 'active').length,
      exempt: rows.filter((r) => r.subscriptionStatus === 'exempt').length,
      blocked: rows.filter((r) => r.blocked).length,
    }

    return NextResponse.json({
      settings: {
        billingEnabled,
        billingEnabledAt: settings.billing_enabled_at,
        monthlyPrice: Number(settings.monthly_price),
      },
      establishments: rows,
      counts,
    })
  } catch (err) {
    logError('api:admin:overview', 'erro ao carregar visão geral', err)
    return NextResponse.json({ error: 'Erro ao carregar dados' }, { status: 500 })
  }
}
