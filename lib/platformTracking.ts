'use client'

import { createClient } from '@/lib/supabase/client'

// Visitas e etapas do cadastro do Freguês (aba Crescimento do admin).
// Anônimo: um id aleatório por navegador e a origem da primeira visita
// (utm_* do link ou o site que mandou). Nada de dado pessoal aqui.

const VISITOR_KEY = 'fregues_visitor'
const ORIGIN_KEY = 'fregues_origin'

export interface VisitOrigin {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  referrer?: string
  landing_path?: string
}

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function getVisitorId(): string {
  const s = storage()
  let id = s?.getItem(VISITOR_KEY) || ''
  if (!id) {
    id = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).slice(0, 64)
    s?.setItem(VISITOR_KEY, id)
  }
  return id
}

/** Guarda a origem da primeira visita (um link novo com utm substitui). */
export function captureOrigin(): VisitOrigin {
  const s = storage()
  const params = new URLSearchParams(window.location.search)
  const fromUrl: VisitOrigin = {
    utm_source: params.get('utm_source') || params.get('ref') || undefined,
    utm_medium: params.get('utm_medium') || undefined,
    utm_campaign: params.get('utm_campaign') || undefined,
  }
  const externalReferrer = document.referrer && !document.referrer.startsWith(window.location.origin) ? document.referrer : undefined
  let saved: VisitOrigin = {}
  try {
    saved = JSON.parse(s?.getItem(ORIGIN_KEY) || '{}')
  } catch {
    saved = {}
  }
  if (fromUrl.utm_source || (!saved.landing_path && !saved.referrer)) {
    saved = { ...fromUrl, referrer: externalReferrer || saved.referrer, landing_path: window.location.pathname }
    s?.setItem(ORIGIN_KEY, JSON.stringify(saved))
  }
  return saved
}

export async function trackPlatformEvent(event: 'landing_view' | 'signup_view' | 'signup_step1' | 'pricing_view' | 'login_view'): Promise<void> {
  try {
    const origin = captureOrigin()
    await createClient().rpc('track_platform_event', {
      p_event: event,
      p_payload: { visitor_id: getVisitorId(), path: window.location.pathname, referrer: origin.referrer, utm_source: origin.utm_source, utm_medium: origin.utm_medium, utm_campaign: origin.utm_campaign },
    })
  } catch {
    // contagem é best-effort: nunca atrapalha a navegação
  }
}

/** Passo 1 do cadastro: guarda o contato (nome, WhatsApp, e-mail) para a equipe. */
export async function registerSignupLead(data: { name: string; email: string; whatsapp: string; store_name?: string }): Promise<void> {
  try {
    const origin = captureOrigin()
    await createClient().rpc('register_signup_lead', { p_payload: { ...data, ...origin, visitor_id: getVisitorId() } })
  } catch {
    // o cadastro segue mesmo se o registro do contato falhar
  }
}
