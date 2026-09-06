import { NextRequest, NextResponse } from 'next/server'
import { adminContext, adminErrorResponse } from '@/lib/admin/route'
import { AdminError } from '@/lib/admin/debrief'
import { logAdminAction } from '@/lib/admin/audit'
import { createLoginToken, recentLoginTokenCount, MAX_LINKS_PER_HOUR } from '@/lib/portal/tokens'
import { sendPortalLoginEmail } from '@/lib/portal/send'
import { getBaseUrl } from '@/lib/url'

export const runtime = 'nodejs'

/** Send (or resend) one portal invitation from the command center. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase, actor } = await adminContext()
    const { data: client } = await supabase.from('clients').select('id, org_id, name, email').eq('id', params.id).maybeSingle()
    if (!client) throw new AdminError(404, 'Client not found.')
    if (!client.email) throw new AdminError(400, 'This client has no email on file.')
    if ((await recentLoginTokenCount(client.id)) >= MAX_LINKS_PER_HOUR) {
      throw new AdminError(429, 'Too many sign-in links sent to this client in the last hour.')
    }
    const raw = await createLoginToken(client.id, client.org_id)
    const link = `${getBaseUrl()}/portal/verify?token=${raw}`
    const r = await sendPortalLoginEmail({ client: { id: client.id, name: client.name, email: client.email }, link, kind: 'invite', sender: actor })
    await logAdminAction(supabase, { actorCoachId: actor.id, action: 'portal_invite_sent', targetClientId: client.id, detail: { via: r.via, ok: r.ok } })
    if (!r.ok) throw new AdminError(502, `Could not send the invite. ${r.error || ''}`.trim())
    return NextResponse.json({ ok: true, sentTo: client.email, via: r.via })
  } catch (e) {
    return adminErrorResponse(e)
  }
}
