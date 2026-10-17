// Etapas exibidas na página de acompanhamento, com horário de cada uma.
// Função pura para testar a regra sem tela.

export interface TimelineOrder {
  status: 'pending' | 'confirmed' | 'preparing' | 'completed' | 'cancelled'
  order_type: 'delivery' | 'pickup' | 'mesa'
  order_tracking_enabled: boolean
  created_at: string
  accepted_at?: string | null
  dispatched_at?: string | null
  completed_at?: string | null
  eta_minutes?: number | null
}

export interface TimelineStep {
  key: string
  label: string
  at: string | null
  state: 'done' | 'current' | 'todo'
}

export function buildOrderTimeline(order: TimelineOrder): TimelineStep[] {
  const pickup = order.order_type !== 'delivery'
  const steps: { key: string; label: string; at: string | null; reached: boolean }[] = [
    { key: 'received', label: 'Pedido recebido', at: order.created_at, reached: true },
    {
      key: 'accepted',
      label: order.eta_minutes ? `Aceito pela loja · cerca de ${order.eta_minutes} min` : 'Aceito pela loja',
      at: order.accepted_at || null,
      reached: order.status !== 'pending',
    },
  ]
  if (order.order_tracking_enabled) {
    steps.push({ key: 'preparing', label: 'Em preparo', at: null, reached: order.status === 'preparing' || !!order.dispatched_at || order.status === 'completed' })
    steps.push({
      key: 'dispatched',
      label: pickup ? 'Pronto para retirar' : 'Saiu para entrega',
      at: order.dispatched_at || null,
      reached: !!order.dispatched_at || order.status === 'completed',
    })
  }
  steps.push({ key: 'completed', label: pickup ? 'Retirado' : 'Entregue', at: order.completed_at || null, reached: order.status === 'completed' })

  const lastReached = steps.reduce((acc, s, i) => (s.reached ? i : acc), 0)
  return steps.map((s, i) => ({
    key: s.key,
    label: s.label,
    at: s.at,
    state: i < lastReached ? 'done' : i === lastReached ? (order.status === 'completed' ? 'done' : 'current') : 'todo',
  }))
}

// Faixa de previsão "19:55 – 20:05": aceite + tempo informado, com ±5 min.
export function estimateArrival(order: Pick<TimelineOrder, 'accepted_at' | 'eta_minutes' | 'status'>, timeZone = 'America/Sao_Paulo'): string | null {
  if (!order.accepted_at || !order.eta_minutes || order.status === 'completed' || order.status === 'cancelled') return null
  const base = new Date(order.accepted_at).getTime() + order.eta_minutes * 60000
  const fmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone })
  return `${fmt.format(new Date(base - 5 * 60000))} – ${fmt.format(new Date(base + 5 * 60000))}`
}
