'use client'

import type { ReactNode } from 'react'
import { formatBRL } from '@/lib/money'

// Peças visuais da aba Crescimento.

export const num = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('pt-BR'))
export const pctText = (n: number | null | undefined) => (n == null ? '—' : `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`)
export const brl = (n: number | null | undefined) => (n == null ? '—' : formatBRL(n))
export const dateBR = (iso: string | null | undefined) => (iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('pt-BR') : '—')
export const dateTimeBR = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : tone === 'ok' ? 'text-green-700' : 'text-gray-900'
  return (
    <div className="rounded-xl bg-gray-50 p-3 min-w-0">
      <p className="text-xs text-gray-500 truncate">{label}</p>
      <p className={`text-xl font-bold tabular-nums mt-0.5 ${color}`}>{value}</p>
      {hint && <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{hint}</p>}
    </div>
  )
}

/** Tom pela referência: maior é melhor (ou menor, com lowerIsBetter). */
export function toneFor(value: number | null | undefined, benchmark: number, lowerIsBetter = false): 'ok' | 'warn' | 'bad' | undefined {
  if (value == null) return undefined
  const good = lowerIsBetter ? value <= benchmark : value >= benchmark
  if (good) return 'ok'
  const far = lowerIsBetter ? value > benchmark * 2 : value < benchmark / 2
  return far ? 'bad' : 'warn'
}

export function Section({ title, subtitle, children, right }: { title: string; subtitle?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

export async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Erro ao carregar.')
  return data as T
}
