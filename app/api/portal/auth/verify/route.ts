import { NextRequest, NextResponse } from 'next/server'
import { consumeLoginToken } from '@/lib/portal/tokens'
import { signPortalToken, PORTAL_COOKIE, portalCookieOptions } from '@/lib/portal/session'
import { logPortalAccess } from '@/lib/portal/access'

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
    return NextResponse.json({ error: 'This link is invalid or has expired.' }, { status: 401 })
  }

  await logPortalAccess(result.clientId, 'login_verify')

  const jwt = await signPortalToken(result.clientId)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(PORTAL_COOKIE, jwt, portalCookieOptions())
  return res
}
