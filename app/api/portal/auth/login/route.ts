import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyPortalLogin } from '@/lib/portal/credentials'
import { signPortalToken, PORTAL_COOKIE, portalCookieOptions } from '@/lib/portal/session'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { checkPortalRateLimit, logPortalAccess } from '@/lib/portal/access'

export const runtime = 'nodejs'

/**
 * Username + password sign-in (migration 054). The magic link remains available
 * and is the recovery path.
 *
 * Every failure returns the same generic message whatever the cause — unknown
 * username, wrong password, or a locked account — so this endpoint can't be used
 * to discover which usernames exist.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const username = String(body.username || '').trim()
  const password = String(body.password || '')
  const generic = NextResponse.json(
    { error: 'That username and password did not match.' },
    { status: 401 }
  )
  if (!username || !password) return generic

  // Throttle by the account being targeted, when it resolves to one. Looking the
  // client up here (rather than after verification) is what lets a locked
  // account still return the generic response above.
  let clientId: string | null = null
  try {
    const supabase = getSupabaseAdmin()
    const { data } = await supabase
      .from('client_credentials')
      .select('client_id')
      .eq('username', username.toLowerCase())
      .maybeSingle()
    clientId = data?.client_id ?? null
  } catch {
    /* fall through — verify will fail closed */
  }

  if (clientId) {
    const limit = await checkPortalRateLimit(clientId, 'login_password')
    if (!limit.allowed) return generic
  }

  const result = await verifyPortalLogin(username, password)
  if (clientId) await logPortalAccess(clientId, 'login_password', { ok: result.ok })
  if (!result.ok) return generic

  const token = await signPortalToken(result.clientId)
  cookies().set(PORTAL_COOKIE, token, portalCookieOptions())
  return NextResponse.json({ ok: true })
}
