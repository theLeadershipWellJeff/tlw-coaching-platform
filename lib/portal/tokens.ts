/**
 * Magic-link login tokens for the Client Portal. The raw token is emailed inside
 * the link and NEVER stored — only its sha256 hash lands in `client_tokens`.
 * Tokens are single-use (used_at) and expire after 24h. Node route handlers only.
 */
import { createHash, randomBytes } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase/server'

const TOKEN_TTL_MS = 24 * 3600 * 1000
/** Max magic-link emails per client per hour (anti-abuse). */
export const MAX_LINKS_PER_HOUR = 5

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

/** Mint + persist a login token; returns the RAW token for the emailed link. */
export async function createLoginToken(clientId: string, orgId: string): Promise<string> {
  const raw = randomBytes(32).toString('hex')
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('client_tokens').insert({
    client_id: clientId,
    org_id: orgId,
    token_hash: hashToken(raw),
    purpose: 'login',
    expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
  })
  if (error) throw new Error(`client_tokens insert: ${error.message}`)
  return raw
}

/** How many login links this client has been sent in the last hour. */
export async function recentLoginTokenCount(clientId: string): Promise<number> {
  const supabase = getSupabaseAdmin()
  const since = new Date(Date.now() - 3600 * 1000).toISOString()
  const { count } = await supabase
    .from('client_tokens')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('purpose', 'login')
    .gte('created_at', since)
  return count ?? 0
}

/**
 * Validate + consume a raw login token. Returns the client on success, or null if
 * unknown / expired / already used. Single-use is enforced by claiming the row
 * with an `is('used_at', null)` guard so a race can't double-consume.
 */
export async function consumeLoginToken(
  raw: string
): Promise<{ clientId: string; orgId: string } | null> {
  if (!raw) return null
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('client_tokens')
    .select('id, client_id, org_id, expires_at, used_at')
    .eq('token_hash', hashToken(raw))
    .eq('purpose', 'login')
    .maybeSingle()
  if (error || !data) return null
  if (data.used_at) return null
  if (new Date(data.expires_at).getTime() < Date.now()) return null

  const { data: claimed } = await supabase
    .from('client_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', data.id)
    .is('used_at', null)
    .select('id')
    .maybeSingle()
  if (!claimed) return null // lost the race — already consumed

  return { clientId: data.client_id, orgId: data.org_id }
}
