import { NextRequest, NextResponse } from 'next/server'
import { getPortalClientId } from '@/lib/portal/server'
import { setPortalCredentials, getPortalLoginStatus } from '@/lib/portal/credentials'
import { logPortalAccess } from '@/lib/portal/access'

export const runtime = 'nodejs'

/**
 * A signed-in portal client sets or changes their own username + password
 * (migration 054).
 *
 * Requires an existing portal session, which means the client got here through a
 * magic link — so possession of the email account is what authorizes creating
 * the password, and there is no separate reset flow to secure: a client who
 * forgets their password signs in with a fresh link and sets a new one.
 */
export async function GET() {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const status = await getPortalLoginStatus(clientId)
  return NextResponse.json({ username: status.username, hasPassword: status.hasPassword })
}

export async function POST(req: NextRequest) {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const username = String(body.username || '')
  const password = String(body.password || '')

  const result = await setPortalCredentials(clientId, username, password)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  await logPortalAccess(clientId, 'password_set')
  return NextResponse.json({ ok: true })
}
