'use client'

import { useEffect } from 'react'

/** Fecha um modal/painel ao apertar Esc, enquanto `active` for true. */
export function useEscapeKey(onEscape: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape()
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [active, onEscape])
}
