import { NextRequest, NextResponse } from 'next/server'
import { getPortalClientId } from '@/lib/portal/server'
import {
  setPortalCredentials,
  getPortalLoginStatus,
  isPasswordChangeRequired,
  setPasswordChangeRequired,
  isCurrentPassword,
} from '@/lib/portal/credentials'
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
 *
 * When a supervisor set a temporary password (`mustChange`), saving a new one
 * clears the flag, and re-saving the temporary password itself is refused.
 */
export async function GET() {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const [status, mustChange] = await Promise.all([
    getPortalLoginStatus(clientId),
    isPasswordChangeRequired(clientId).catch(() => false),
  ])
  return NextResponse.json({ username: status.username, hasPassword: status.hasPassword, mustChange })
}

export async function POST(req: NextRequest) {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const username = String(body.username || '')
  const password = String(body.password || '')

  const mustChange = await isPasswordChangeRequired(clientId).catch(() => false)
  if (mustChange && (await isCurrentPassword(clientId, password))) {
    return NextResponse.json(
      { error: 'Please choose a new password — not the temporary one you were given.' },
      { status: 400 }
    )
  }

  const result = await setPortalCredentials(clientId, username, password)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  if (mustChange) await setPasswordChangeRequired(clientId, false)

  await logPortalAccess(clientId, 'password_set')
  return NextResponse.json({ ok: true })
}
