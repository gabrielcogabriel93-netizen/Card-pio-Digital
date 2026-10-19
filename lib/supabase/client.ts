'use client'

import { createBrowserClient } from '@supabase/ssr'
import { resilientFetch } from './resilientFetch'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: resilientFetch } }
  )
}
