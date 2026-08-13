import { NextRequest, NextResponse } from 'next/server'
import { PORTAL_COOKIE, verifyPortalToken } from '@/lib/portal/session'

/**
 * Client Portal guard. Everything under /portal requires a valid portal session
 * cookie, EXCEPT the public login + verify pages. A coach's NextAuth session is
 * irrelevant here — this surface only accepts a portal session. Runs on the Edge
 * runtime, so it uses the Web-Crypto verify in lib/portal/session (no Node APIs).
 *
 * Note: /api/portal/** is intentionally NOT matched — those routes self-guard and
 * must be reachable while logged out (login request, verify).
 */
const PUBLIC_PATHS = ['/portal/login', '/portal/verify']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  const token = req.cookies.get(PORTAL_COOKIE)?.value
  const session = await verifyPortalToken(token)
  if (!session) {
    const url = req.nextUrl.clone()
    url.pathname = '/portal/login'
    url.search = ''
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/portal', '/portal/:path*'],
}
