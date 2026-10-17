'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

// Avisos (toast) e confirmação no lugar de alert()/confirm() nativos,
// que travam a tela, não seguem a marca e às vezes nem aparecem dentro
// do app instalado (PWA) ou do navegador do Instagram. API imperativa de
// propósito: `toast('Salvo')` e `if (!(await confirmDialog(...))) return`
// funcionam de qualquer handler, sem prop drilling.

type ToastKind = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  message: string
  kind: ToastKind
}
interface ConfirmRequest {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  resolve: (value: boolean) => void
}

type Listener = () => void
const state: { toasts: ToastItem[]; confirm: ConfirmRequest | null } = { toasts: [], confirm: null }
const listeners = new Set<Listener>()
let nextId = 1
const emit = () => listeners.forEach((l) => l())

export function toast(message: string, kind: ToastKind = 'info', durationMs = 4500) {
  if (typeof window === 'undefined') return
  const id = nextId++
  state.toasts = [...state.toasts, { id, message, kind }].slice(-2)
  emit()
  window.setTimeout(() => {
    state.toasts = state.toasts.filter((t) => t.id !== id)
    emit()
  }, durationMs)
}

toast.success = (message: string) => toast(message, 'success')
toast.error = (message: string) => toast(message, 'error', 6500)

export function confirmDialog(options: Omit<ConfirmRequest, 'resolve'> | string): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)
  const opts = typeof options === 'string' ? { title: options } : options
  return new Promise((resolve) => {
    state.confirm?.resolve(false)
    state.confirm = { ...opts, resolve }
    emit()
  })
}

export function FeedbackHost() {
  const [, force] = useState(0)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const listener = () => force((n) => n + 1)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  const confirm = state.confirm
  useEffect(() => {
    if (!confirm) return
    confirmButtonRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirm])

  const close = (value: boolean) => {
    const current = state.confirm
    state.confirm = null
    emit()
    current?.resolve(value)
  }

  return (
    <>
      <div
        className="fixed z-[200] left-1/2 -translate-x-1/2 flex flex-col gap-2 w-[min(92vw,420px)] pointer-events-none"
        // No topo: embaixo ficam os botões principais das folhas (sacola, finalizar).
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
        role="status"
        aria-live="polite"
      >
        {state.toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm shadow-lg animate-fade-in ${
              t.kind === 'error' ? 'bg-red-600 text-white' : t.kind === 'success' ? 'bg-ink text-white' : 'bg-ink text-white'
            }`}
          >
            {t.kind === 'success' ? (
              <CheckCircle2 size={18} className="flex-shrink-0 text-comanda" />
            ) : t.kind === 'error' ? (
              <AlertCircle size={18} className="flex-shrink-0" />
            ) : (
              <Info size={18} className="flex-shrink-0 text-comanda" />
            )}
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => {
                state.toasts = state.toasts.filter((x) => x.id !== t.id)
                emit()
              }}
              className="opacity-70 hover:opacity-100"
              aria-label="Fechar aviso"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>

      {confirm && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => close(false)} />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 animate-fade-in"
          >
            <h2 id="confirm-title" className="font-display text-lg font-bold text-gray-900">{confirm.title}</h2>
            {confirm.message && <p className="text-sm text-gray-600 mt-2">{confirm.message}</p>}
            <div className="flex gap-3 mt-6">
              <button onClick={() => close(false)} className="btn-secondary flex-1">
                {confirm.cancelLabel || 'Cancelar'}
              </button>
              <button
                ref={confirmButtonRef}
                onClick={() => close(true)}
                className={`${confirm.danger ? 'btn-danger' : 'btn-primary'} flex-1`}
              >
                {confirm.confirmLabel || 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
