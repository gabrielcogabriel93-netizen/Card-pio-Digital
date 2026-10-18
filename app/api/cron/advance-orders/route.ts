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
        'id, order_tracking_enabled, auto_confirm_minutes, auto_preparing_minutes, auto_completed_minutes_pickup, auto_completed_minutes_delivery'
      )
      .eq('order_automation_mode', 'automatic')

    if (estError) throw estError
    if (!establishments || establishments.length === 0) {
      return NextResponse.json({ advanced: 0 })
    }

    const establishmentIds = establishments.map((e) => e.id)
    // Pedidos de mesa (migration 039) ficam de fora da automação por
    // tempo: quem decide quando um pedido de mesa avança é a cozinha,
    // manualmente pelo Kanban — não faz sentido "confirmar sozinho após
    // 2 minutos" um pedido que ainda vai se somar a outros na mesma
    // comanda. resolveNextAutomaticStatus também só aceita
    // orderType 'delivery'/'pickup', sem 'mesa'.
    // Só pedidos das últimas 24h: pendência mais antiga que isso não é
    // automatizável (ver AUTOMATION_MAX_PENDING_AGE_MINUTES) e ler o
    // histórico inteiro a cada minuto não escala.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: orders, error: ordersError } = await admin
      .from('orders')
      .select('*')
      .in('establishment_id', establishmentIds)
      .in('status', ['pending', 'confirmed', 'preparing'])
      .neq('source', 'mesa')
      .gte('created_at', since)

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
          // A query acima já filtra .neq('source', 'mesa'), então nunca
          // chega aqui um order_type='mesa' — TS não enxerga esse filtro
          // de runtime, daí o cast.
          orderType: order.order_type as 'delivery' | 'pickup',
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

      // Primeiro aceite: status, financeiro e estoque juntos numa
      // transação no banco (service_accept_order, com trava de linha).
      if (order.status === 'pending') {
        try {
          const accepted = await applyAutomaticOrderConfirmation(admin, order.id, nextStatus as 'confirmed' | 'completed')
          if (accepted) advanced++
        } catch {
          // já logado dentro da função; segue para o próximo pedido
        }
        continue
      }

      // Demais etapas: UPDATE condicional no status que lemos -- se outra
      // execução (ou o lojista) já mexeu no pedido, a linha não bate e pula.
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

      await applyStatusOnly(updated as Order)
      advanced++
    }

    log('cron:advance-orders', 'execução concluída', { avaliados: orders.length, avancados: advanced })
    return NextResponse.json({ advanced })
  } catch (err) {
    logError('cron:advance-orders', 'erro ao processar automação de pedidos', err)
    return NextResponse.json({ error: 'Erro ao processar automação de pedidos' }, { status: 500 })
  }
}
