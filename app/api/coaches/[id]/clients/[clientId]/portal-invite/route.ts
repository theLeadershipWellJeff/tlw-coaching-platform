import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireSupervisor, toErrorResponse } from '@/lib/api-handler'
import { createLoginToken, recentLoginTokenCount, MAX_LINKS_PER_HOUR } from '@/lib/portal/tokens'
import { buildMagicLinkEmailHtml } from '@/lib/portal/email'
import { sendCoachHtmlEmail } from '@/lib/gmail'
import { getBaseUrl } from '@/lib/url'
import { logCommunication } from '@/lib/communications'
import { logAdminAction } from '@/lib/admin/audit'
import type { Coach } from '@/lib/supabase/types'

export const runtime = 'nodejs'

/**
 * POST /api/coaches/[id]/clients/[clientId]/portal-invite — the Command
 * Center's on-behalf resend: a supervisor re-sends a portal sign-in link for
 * ANOTHER coach's client.
 *
 * The email goes out from the OWNING coach's Gmail whenever they've signed in
 * (their refresh token is on file), so the client always hears from their own
 * coach — the acting supervisor's Gmail is only the fallback for a coach who
 * has never completed sign-in. Rate-limited with the same per-client cap as
 * every other magic-link path, logged to communications (it shows on the
 * client's Recent Communication card) and to the admin audit trail.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string; clientId: string } }
) {
  const supabase = getSupabaseAdmin()
  let actor
  try {
    actor = await requireSupervisor(supabase)
  } catch (e) {
    return toErrorResponse(e)
  }

  // The client must actually belong to the named coach — the URL is the claim,
  // the link table is the proof.
  const { data: link } = await supabase
    .from('coach_clients')
    .select('client_id')
    .eq('coach_id', params.id)
    .eq('client_id', params.clientId)
    .maybeSingle()
  if (!link) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const [{ data: owner }, { data: client }] = await Promise.all([
    supabase.from('coaches').select('*').eq('id', params.id).maybeSingle(),
    supabase
      .from('clients')
      .select('id, org_id, name, email')
      .eq('id', params.clientId)
      .maybeSingle(),
  ])
  if (!owner || !client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  if (!client.email) {
    return NextResponse.json({ error: 'This client has no email on file.' }, { status: 400 })
  }

  if ((await recentLoginTokenCount(client.id)) >= MAX_LINKS_PER_HOUR) {
    return NextResponse.json(
      { error: 'Too many sign-in links sent to this client in the last hour. Try again later.' },
      { status: 429 }
    )
  }

  const sender: Coach = (owner as Coach).google_refresh_token ? (owner as Coach) : actor
  if (!sender.google_refresh_token) {
    return NextResponse.json(
      { error: 'Neither the coach nor your account has Gmail access — sign out and back in.' },
      { status: 400 }
    )
  }

  const raw = await createLoginToken(client.id, client.org_id)
  const link_ = `${getBaseUrl()}/portal/verify?token=${raw}`
  const firstName = (client.name || '').split(' ')[0] || 'there'
  const subject = 'Your coaching portal invitation'
  const html = buildMagicLinkEmailHtml({ firstName, link: link_, coachName: (owner as Coach).name })

  const sent = await sendCoachHtmlEmail(sender, { to: client.email, cc: '', subject, html })

  // Attributed to the OWNING coach either way — it's their client relationship.
  await logCommunication(supabase, {
    coach_id: params.id,
    client_id: client.id,
    type: 'email',
    direction: 'outbound',
    subject,
    preview: 'Client Portal sign-in link',
    body_html: null,
    status: sent ? 'sent' : 'failed',
    error_detail: sent ? null : 'Gmail send failed',
  } as any)

  if (!sent) return NextResponse.json({ error: 'Could not send the invite email.' }, { status: 502 })

  await logAdminAction(supabase, {
    actorCoachId: actor.id,
    action: 'portal_invite_resend',
    targetCoachId: params.id,
    targetClientId: client.id,
    detail: { sent_from: sender.id === actor.id ? 'supervisor' : 'owning_coach' },
  })

  return NextResponse.json({ ok: true, sentTo: client.email, sentFrom: sender.email })
}
