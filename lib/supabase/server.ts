import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

/**
 * Server-only Supabase client.
 *
 * Uses the SERVICE ROLE key, which bypasses row-level security. Only ever
 * import this from server code (API routes, server components, server
 * actions) — never from a "use client" file, or the secret key would leak
 * to the browser.
 */
let cached: SupabaseClient<Database> | null = null

export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (cached) return cached

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and ' +
        'SUPABASE_SERVICE_ROLE_KEY in your environment (.env.local).'
    )
  }

  cached = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}
