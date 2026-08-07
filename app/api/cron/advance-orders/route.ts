import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { applyAutomaticOrderConfirmation, applyStatusOnly, resolveNextAutomaticStatus } from '@/lib/orderAutoConfirm'
import { log, logError } from '@/lib/logger'
import { safeCompareSecret } from '@/lib/safeCompare'
import type { Order } from '@/types'

export const runtime = 'nodejs'

// Chamada pelo pg_cron do Supabase a cada minuto (ver migration 029) —
// autenticada por segredo compartilhado, igual o trigger de push da
// migration 014. Nenhuma lógica de negócio mora no banco: aqui é onde
// decidimos quais pedidos avançam sozinhos e aplicamos a mudança.
export async function POST(request: NextRequest) {
  const secretHeader = request.headers.get('x-cron-secret')
  if (!safeCompareSecret(secretHeader, process.env.CRON_TRIGGER_SECRET)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Selo de saúde: grava que essa execução aconteceu, não importa se
  // encontrou pedido pra avançar ou não — é o que o banner de automação
  // em Pedidos usa pra avisar se o cron parou de rodar.
  await admin
    .from('cron_health')
    .upsert({ job_name: 'advance-automatic-orders', last_run_at: new Date().toISOString() }, { onConflict: 'job_name' })

  try {
    const { data: establishments, error: estError } = await admin
      .from('establishments')
      .select(
        'id, order_tracking_enabled, whatsapp_notifications_enabled, auto_confirm_minutes, auto_preparing_minutes, auto_completed_minutes_pickup, auto_completed_minutes_delivery'
      )
      .eq('order_automation_mode', 'automatic')

    if (estError) throw estError
    if (!establishments || establishments.length === 0) {
      return NextResponse.json({ advanced: 0 })
    }

    const establishmentIds = establishments.map((e) => e.id)
    const { data: orders, error: ordersError } = await admin
      .from('orders')
      .select('*')
      .in('establishment_id', establishmentIds)
      .in('status', ['pending', 'confirmed', 'preparing'])

    if (ordersError) throw ordersError
    if (!orders || orders.length === 0) {
      return NextResponse.json({ advanced: 0 })
    }

    const establishmentsById = new Map(establishments.map((e) => [e.id, e]))
    let advanced = 0

    for (const order of orders as Order[]) {
      const establishment = establishmentsById.get(order.establishment_id)
      if (!establishment || !order.status_changed_at) continue

      const nextStatus = resolveNextAutomaticStatus(
        {
          status: order.status as 'pending' | 'confirmed' | 'preparing',
          orderType: order.order_type,
          paymentMethod: order.payment_method,
          paymentStatus: order.payment_status,
          statusChangedAt: new Date(order.status_changed_at),
          orderTrackingEnabled: establishment.order_tracking_enabled ?? true,
        },
        {
          autoConfirmMinutes: establishment.auto_confirm_minutes,
          autoPreparingMinutes: establishment.auto_preparing_minutes,
          autoCompletedMinutesPickup: establishment.auto_completed_minutes_pickup,
          autoCompletedMinutesDelivery: establishment.auto_completed_minutes_delivery,
        }
      )
      if (!nextStatus) continue

      // UPDATE condicional no status que lemos: se outra execução do cron
      // (ou uma ação manual do lojista) já mexeu nesse pedido nesse meio
      // tempo, essa linha não bate mais e a gente simplesmente pula —
      // evita duplicar financeiro/estoque/notificação.
      const { data: updated, error: updateError } = await admin
        .from('orders')
        .update({ status: nextStatus })
        .eq('id', order.id)
        .eq('status', order.status)
        .select()
        .maybeSingle()

      if (updateError) {
        logError('cron:advance-orders', 'erro ao atualizar status do pedido', updateError)
        continue
      }
      if (!updated) continue

      if (order.status === 'pending') {
        await applyAutomaticOrderConfirmation(admin, updated as Order, nextStatus as 'confirmed' | 'completed', establishment)
      } else {
        await applyStatusOnly(updated as Order, nextStatus as 'preparing' | 'completed', establishment)
      }
      advanced++
    }

    log('cron:advance-orders', 'execução concluída', { avaliados: orders.length, avancados: advanced })
    return NextResponse.json({ advanced })
  } catch (err) {
    logError('cron:advance-orders', 'erro ao processar automação de pedidos', err)
    return NextResponse.json({ error: 'Erro ao processar automação de pedidos' }, { status: 500 })
  }
}
