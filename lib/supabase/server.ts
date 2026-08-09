import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'
import { mintSupabaseAccessToken, type TenantClaims } from './jwt'

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

function normalizeSupabaseUrl(): string {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!rawUrl) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL in your environment.'
    )
  }
  return rawUrl.trim().replace(/\/+$/, '')
}

/**
 * Request-scoped Supabase client that HONORS Row Level Security.
 *
 * Unlike `getSupabaseAdmin()` (service-role, bypasses RLS), this client
 * authenticates as the Postgres `authenticated` role with a JWT carrying the
 * caller's org/coach claims, so RLS policies scope every query to their tenant.
 * It is NOT cached — one client per request/claims. Uses the publishable (anon)
 * key as the `apikey` and the minted JWT as the bearer token.
 *
 * DORMANT until the strangler RLS rollout (Phase 1 §5.3) switches a route onto
 * it. Because RLS is already enabled on every table (deny-by-default), a route
 * using this client returns zero rows until that table has a policy — which is
 * exactly why the cutover happens one group at a time, paired with its policies.
 *
 * Requires `SUPABASE_JWT_SECRET` (to sign) and the publishable key to be set.
 */
export function getSupabaseForClaims(claims: TenantClaims): SupabaseClient<Database> {
  const anonKey =
    process.env.SUPABASE_API_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!anonKey) {
    throw new Error(
      'Supabase publishable key is not configured. Set SUPABASE_API_PUBLISHABLE_KEY ' +
        '(needed for the request-scoped, RLS-honoring client).'
    )
  }
  const url = normalizeSupabaseUrl()
  const token = mintSupabaseAccessToken(claims)
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}
