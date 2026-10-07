import { NextRequest, NextResponse } from 'next/server'
import { consumeLoginToken } from '@/lib/portal/tokens'
import { signPortalToken, PORTAL_COOKIE, portalCookieOptions } from '@/lib/portal/session'
import { logPortalAccess } from '@/lib/portal/access'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { isPortalAccessBlocked } from '@/lib/portal/archive'
import { getPortalClientId } from '@/lib/portal/server'

export const runtime = 'nodejs'

/**
 * Consume a magic-link token and start a portal session. POST-only (the /portal/
 * verify page submits it) so email link-scanners that prefetch the GET link can't
 * silently burn the single-use token.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const token = String(body.token || '')

  const result = await consumeLoginToken(token)
  if (!result) {
    // Links are single-use, so re-clicking an invitation that was already used
    // fails. When this browser already holds a live portal session, that person
    // is signed in — send them to their own portal instead of an error page.
    // Nothing about the token's owner is revealed: the session decides where
    // they land, never the link.
    const signedIn = await getPortalClientId().catch(() => null)
    if (signedIn) return NextResponse.json({ ok: true, alreadySignedIn: true })
    return NextResponse.json({ error: 'This link is invalid or has expired.' }, { status: 401 })
  }

  // Archived or past the access window: refuse with the same message as a bad
  // link (consistent with request/login). A failed lookup fails open — the
  // session check in getPortalClientId re-applies the rule on every request.
  try {
    const { data: owner } = await getSupabaseAdmin()
      .from('clients')
      .select('portal_features, portal_access_expires_at')
      .eq('id', result.clientId)
      .maybeSingle()
    if (owner && isPortalAccessBlocked(owner)) {
      return NextResponse.json({ error: 'This link is invalid or has expired.' }, { status: 401 })
    }
  } catch {
    /* fail open */
  }

  await logPortalAccess(result.clientId, 'login_verify')

  const jwt = await signPortalToken(result.clientId)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(PORTAL_COOKIE, jwt, portalCookieOptions())
  return res
}
