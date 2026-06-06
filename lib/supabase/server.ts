import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

/**
 * Server-only Supabase client.
 *
 * Uses the SECRET key (Supabase's "secret"/service-role key), which bypasses
 * row-level security. Only ever import this from server code (API routes,
 * server components, server actions) — never from a "use client" file, or the
 * secret key would leak to the browser.
 */
let cached: SupabaseClient<Database> | null = null

export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (cached) return cached

  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  // Accept the newer "secret key" name, falling back to the classic
  // service-role name so either Vercel setup works.
  const secretKey =
    process.env.SUPABASE_API_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!rawUrl || !secretKey) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and ' +
        'SUPABASE_API_SECRET_KEY in your environment (.env.local / Vercel).'
    )
  }

  // Normalize + sanity-check the URL. The most common misconfiguration is
  // pasting the dashboard URL (https://supabase.com/dashboard/project/<ref>)
  // instead of the API URL (https://<ref>.supabase.co), which makes the server
  // respond "invalid path specified in request URL".
  const url = rawUrl.trim().replace(/\/+$/, '')
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in|red)$/i.test(url)) {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL looks wrong ("${url}"). It must be your ` +
        'project API URL, e.g. https://abcd1234.supabase.co — not the ' +
        'dashboard URL. Find it in Supabase → Project Settings → API → Project URL.'
    )
  }

  cached = createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}
