import type { Order } from '@/types'

/**
 * Total corrente de uma comanda de mesa (migration 039) — soma dos
 * pedidos ainda não cancelados. Espelha a mesma regra usada pela RPC
 * `close_table_tab` no banco (SUM(total) WHERE status <> cancelado),
 * mas roda no client pra mostrar o total em tempo real no painel de
 * Mesas antes de fechar a conta.
 */
export function sumTabTotal(orders: Pick<Order, 'total' | 'status'>[]): number {
  return orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + Number(o.total), 0)
}
