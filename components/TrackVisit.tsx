'use client'

import { useEffect } from 'react'
import { trackPlatformEvent } from '@/lib/platformTracking'

/** Conta a visita da página (uma vez por carregamento). */
export function TrackVisit({ event }: { event: Parameters<typeof trackPlatformEvent>[0] }) {
  useEffect(() => {
    trackPlatformEvent(event)
  }, [event])
  return null
}
