/**
 * Client Portal access log + rate limiting (migration 053).
 *
 * The portal is the highest-security surface in the app and the only one a
 * non-coach can reach, so every notable action is recorded: an audit trail for a
 * surface holding a client's full session history, and the counter the rate
 * limiter reads.
 *
 * Counting in Postgres rather than in memory is deliberate — the app is
 * serverless, so an in-process counter resets on every cold start and is not
 * shared between concurrent instances, which makes it no limit at all.
 */
import { getSupabaseAdmin } from '@/lib/supabase/server'

export type PortalAction =
  | 'login_request'
  | 'login_verify'
  | 'login_password'
  | 'password_set'
  | 'chat'
  | 'contact'
  | 'upload'
  | 'note_view'
  | 'session_view'
  | 'pdf_view'

/** Per-client ceilings, per rolling window. */
const LIMITS: Partial<Record<PortalAction, { max: number; windowMinutes: number }>> = {
  chat: { max: 60, windowMinutes: 60 },
  contact: { max: 10, windowMinutes: 60 },
  upload: { max: 20, windowMinutes: 60 },
  login_password: { max: 10, windowMinutes: 15 },
}

/**
 * Record a portal action. Never throws — an audit-log failure must not take down
 * the action the client was performing, and the table may not exist yet on an
 * install that hasn't applied migration 053.
 */
export async function logPortalAccess(
  clientId: string,
  action: PortalAction,
  opts: { detail?: string; ok?: boolean } = {}
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()
    const { data: client } = await supabase
      .from('clients')
      .select('org_id')
      .eq('id', clientId)
      .maybeSingle()
    await supabase.from('portal_access_log').insert({
      client_id: clientId,
      org_id: client?.org_id,
      action,
      detail: opts.detail?.slice(0, 500) ?? null,
      ok: opts.ok ?? true,
    })
  } catch (e) {
    console.error('portal access log failed:', e)
  }
}

/**
 * True when this client is still under the ceiling for `action`.
 *
 * FAILS OPEN: if the log table is unreachable we allow the request rather than
 * locking every client out of the portal over a logging problem. The tradeoff is
 * deliberate — this limiter exists to bound cost and abuse, not to enforce a
 * security boundary (that is the session cookie, which is checked separately).
 */
export async function checkPortalRateLimit(
  clientId: string,
  action: PortalAction
): Promise<{ allowed: boolean; retryAfterMinutes?: number }> {
  const limit = LIMITS[action]
  if (!limit) return { allowed: true }

  try {
    const supabase = getSupabaseAdmin()
    const since = new Date(Date.now() - limit.windowMinutes * 60_000).toISOString()
    const { count, error } = await supabase
      .from('portal_access_log')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('action', action)
      .gte('created_at', since)
    if (error) return { allowed: true }
    if ((count ?? 0) >= limit.max) {
      return { allowed: false, retryAfterMinutes: limit.windowMinutes }
    }
    return { allowed: true }
  } catch {
    return { allowed: true }
  }
}
