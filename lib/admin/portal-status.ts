/**
 * Per-client Client Portal state, for the Command Center (and any supervisor
 * surface that needs "who's actually in the portal").
 *
 * Sources, all read defensively (pre-053/054 databases just yield nulls):
 *   - client_tokens (044)      → invited: any login token ever minted; latest = last invite
 *   - portal_access_log (053)  → last successful sign-in (magic link OR password)
 *   - client_credentials (054) → username set, password lockout state
 *
 * "Active" means the client has successfully signed in at least once — an
 * invite alone proves nothing about adoption.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

export type ClientPortalState = {
  /** Latest magic-link invite/login-link minted for this client (null = never). */
  invitedAt: string | null
  /** Latest successful portal sign-in, either path (null = never been in). */
  lastSeenAt: string | null
  /** Username chosen for password sign-in (null = magic-link only). */
  username: string | null
  /** Password lockout currently in effect (8 failed attempts). */
  locked: boolean
}

const EMPTY: ClientPortalState = { invitedAt: null, lastSeenAt: null, username: null, locked: false }

/** Load portal state for a set of clients in three batched queries. */
export async function loadPortalStates(
  supabase: SupabaseClient<Database>,
  clientIds: string[]
): Promise<Record<string, ClientPortalState>> {
  const states: Record<string, ClientPortalState> = {}
  if (clientIds.length === 0) return states
  for (const id of clientIds) states[id] = { ...EMPTY }

  const now = Date.now()
  const [tokens, logins, creds] = await Promise.all([
    supabase
      .from('client_tokens')
      .select('client_id, created_at')
      .in('client_id', clientIds)
      .eq('purpose', 'login'),
    supabase
      .from('portal_access_log')
      .select('client_id, created_at')
      .in('client_id', clientIds)
      .in('action', ['login_verify', 'login_password'])
      .eq('ok', true),
    supabase
      .from('client_credentials')
      .select('client_id, username, locked_until, last_login_at')
      .in('client_id', clientIds),
  ])

  // Missing tables (pending migrations) surface as query errors — degrade to nulls.
  for (const row of (tokens.data ?? []) as any[]) {
    const s = states[row.client_id]
    if (s && (!s.invitedAt || row.created_at > s.invitedAt)) s.invitedAt = row.created_at
  }
  for (const row of (logins.data ?? []) as any[]) {
    const s = states[row.client_id]
    if (s && (!s.lastSeenAt || row.created_at > s.lastSeenAt)) s.lastSeenAt = row.created_at
  }
  for (const row of (creds.data ?? []) as any[]) {
    const s = states[row.client_id]
    if (!s) continue
    s.username = row.username ?? null
    s.locked = !!row.locked_until && new Date(row.locked_until).getTime() > now
    // The credentials row's own last_login_at backstops a missing access log.
    if (row.last_login_at && (!s.lastSeenAt || row.last_login_at > s.lastSeenAt)) {
      s.lastSeenAt = row.last_login_at
    }
  }

  return states
}
