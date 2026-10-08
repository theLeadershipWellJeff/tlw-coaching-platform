import { NextRequest, NextResponse } from 'next/server'
import { adminContext, adminErrorResponse } from '@/lib/admin/route'
import { AdminError } from '@/lib/admin/debrief'
import { logAdminAction } from '@/lib/admin/audit'
import { setPortalCredentials, setPasswordChangeRequired } from '@/lib/portal/credentials'

export const runtime = 'nodejs'

/**
 * A supervisor sets a portal user's username + a TEMPORARY password — for
 * someone whose emailed links aren't getting through (corporate mail filters).
 * The supervisor passes the password on themselves (phone, text, in person);
 * nothing is emailed. The client is asked to choose their own password at
 * their next sign-in (`portal_features.password_change_required`).
 *
 * The password is hashed (lib/portal/credentials.ts) and never stored or logged
 * in the clear — the audit row records the username only.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase, actor } = await adminContext()
    const body = await req.json().catch(() => ({}))
    const username = String(body.username || '')
    const password = String(body.password || '')

    const { data: client } = await supabase.from('clients').select('id').eq('id', params.id).maybeSingle()
    if (!client) throw new AdminError(404, 'Portal user not found.')

    const result = await setPortalCredentials(client.id, username, password)
    if (!result.ok) throw new AdminError(400, result.error)
    await setPasswordChangeRequired(client.id, true)

    await logAdminAction(supabase, {
      actorCoachId: actor.id,
      action: 'portal_password_set',
      targetClientId: client.id,
      detail: { username: username.trim().toLowerCase(), temporary: true },
    })
    return NextResponse.json({ ok: true, username: username.trim().toLowerCase() })
  } catch (e) {
    return adminErrorResponse(e)
  }
}
