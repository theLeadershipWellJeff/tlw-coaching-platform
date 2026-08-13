import { NextResponse } from 'next/server'
import { PORTAL_COOKIE, portalCookieOptions } from '@/lib/portal/session'

export const runtime = 'nodejs'

/** Clear the portal session cookie. */
export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(PORTAL_COOKIE, '', { ...portalCookieOptions(0), maxAge: 0 })
  return res
}
