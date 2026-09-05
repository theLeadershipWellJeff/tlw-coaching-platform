import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireClientCoach } from '@/lib/client-access'
import { createLoginToken } from '@/lib/portal/tokens'
import { sendPortalLoginEmail } from '@/lib/portal/send'
import { getBaseUrl } from '@/lib/url'
import { toErrorResponse } from '@/lib/api-handler'
import { getPortalLoginStatus } from '@/lib/portal/credentials'

export const runtime = 'nodejs'

/**
 * This client's portal sign-in state, for the coach (migration 054).
 *
 * Returns the username, whether a password is set, and the last sign-in — never
 * anything from which a password could be recovered, because it is stored as a
 * one-way hash. The coach's remedies are to resend the sign-in link (the POST
 * below) or have the client set a new password from their portal.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)

    const [status, lastLogin] = await Promise.all([
      getPortalLoginStatus(params.id),
      supabase
        .from('portal_access_log')
        .select('created_at')
        .eq('client_id', params.id)
        .in('action', ['login_verify', 'login_password'])
        .eq('ok', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    return NextResponse.json({
      portal: {
        ...status,
        // Either sign-in path counts as "has been in"; the credentials row only
        // knows about password logins.
        lastSeenAt: lastLogin.data?.created_at ?? status.lastLoginAt ?? null,
      },
    })
  } catch (e) {
    return toErrorResponse(e)
  }
}

/** Coach-initiated Client Portal invite: mint a magic-link and email it to the
 *  client (Resend when configured, else the coach's Gmail — lib/portal/send.ts).
 *  Tenant-gated via requireClientCoach. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireClientCoach(supabase, params.id)

    const { data: client } = await supabase
      .from('clients')
      .select('id, org_id, name, email')
      .eq('id', params.id)
      .maybeSingle()
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    if (!client.email) {
      return NextResponse.json({ error: 'This client has no email on file.' }, { status: 400 })
    }

    const raw = await createLoginToken(client.id, client.org_id)
    const link = `${getBaseUrl()}/portal/verify?token=${raw}`

    const sent = await sendPortalLoginEmail({
      client: { id: client.id, name: client.name, email: client.email },
      link,
      kind: 'invite',
      coach,
    })
    if (!sent.ok) {
      return NextResponse.json({ error: `Could not send the invite email. ${sent.error ?? ''}`.trim() }, { status: 502 })
    }

    return NextResponse.json({ ok: true, sentTo: client.email })
  } catch (e) {
    return toErrorResponse(e)
  }
}
