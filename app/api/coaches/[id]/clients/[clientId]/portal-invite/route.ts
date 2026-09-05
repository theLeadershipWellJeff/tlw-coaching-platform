import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireSupervisor, toErrorResponse } from '@/lib/api-handler'
import { createLoginToken, recentLoginTokenCount, MAX_LINKS_PER_HOUR } from '@/lib/portal/tokens'
import { sendPortalLoginEmail } from '@/lib/portal/send'
import { getBaseUrl } from '@/lib/url'
import { logAdminAction } from '@/lib/admin/audit'
import type { Coach } from '@/lib/supabase/types'

export const runtime = 'nodejs'

/**
 * POST /api/coaches/[id]/clients/[clientId]/portal-invite — the Command
 * Center's on-behalf resend: a supervisor re-sends a portal sign-in link for
 * ANOTHER coach's client.
 *
 * Sent via lib/portal/send.ts: Resend when configured (Reply-To the owning
 * coach); on the Gmail fallback it goes out from the OWNING coach's Gmail
 * whenever they've signed in, with the acting supervisor's Gmail as the last
 * resort for a coach who has never completed sign-in. Rate-limited with the
 * same per-client cap as every other magic-link path, logged to communications
 * (attributed to the owning coach) and to the admin audit trail.
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

  const owningCoach = owner as Coach
  const sender: Coach = owningCoach.google_refresh_token ? owningCoach : actor

  const raw = await createLoginToken(client.id, client.org_id)
  const link_ = `${getBaseUrl()}/portal/verify?token=${raw}`

  // Attributed to the OWNING coach either way — it's their client relationship.
  const sent = await sendPortalLoginEmail({
    client: { id: client.id, name: client.name, email: client.email },
    link: link_,
    kind: 'invite',
    coach: owningCoach,
    sender,
    attributeToCoachId: params.id,
  })

  if (!sent.ok) {
    return NextResponse.json({ error: `Could not send the invite email. ${sent.error ?? ''}`.trim() }, { status: 502 })
  }

  const sentFrom =
    sent.via === 'resend' ? 'transactional' : sender.id === actor.id ? 'supervisor' : 'owning_coach'
  await logAdminAction(supabase, {
    actorCoachId: actor.id,
    action: 'portal_invite_resend',
    targetCoachId: params.id,
    targetClientId: client.id,
    detail: { sent_from: sentFrom },
  })

  return NextResponse.json({
    ok: true,
    sentTo: client.email,
    sentFrom: sent.via === 'resend' ? process.env.PORTAL_FROM_EMAIL : sender.email,
  })
}
