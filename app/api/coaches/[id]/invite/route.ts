import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireSupervisor, toErrorResponse } from '@/lib/api-handler'
import { logAdminAction } from '@/lib/admin/audit'
import { sendCoachInviteEmail } from '@/lib/admin/coach-invite'

export const runtime = 'nodejs'

/**
 * POST /api/coaches/[id]/invite — email a coach their sign-in invitation
 * (supervisor-only). Works for a coach who has never signed in ("Send
 * invite") and as a re-send for one who has ("Re-send sign-in link") — the
 * email adapts. Every send is written to admin_audit_log as
 * `coach_invite_sent`, which GET /api/coaches reads back as `last_invited_at`.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabaseAdmin()
  let actor
  try {
    actor = await requireSupervisor(supabase)
  } catch (e) {
    return toErrorResponse(e)
  }

  const { data: coach } = await supabase
    .from('coaches')
    .select('id, name, email, google_refresh_token')
    .eq('id', params.id)
    .maybeSingle()
  if (!coach) return NextResponse.json({ error: 'Coach not found' }, { status: 404 })

  const sent = await sendCoachInviteEmail({ coach: coach as any, actor })
  if (!sent.ok) {
    return NextResponse.json(
      { error: `Could not send the invite. ${sent.error ?? ''}`.trim() },
      { status: 502 }
    )
  }

  const sentAt = new Date().toISOString()
  await logAdminAction(supabase, {
    actorCoachId: actor.id,
    action: 'coach_invite_sent',
    targetCoachId: coach.id,
    detail: { to: coach.email, via: sent.via, returning: !!(coach as any).google_refresh_token, warning: sent.warning ?? null },
  })

  return NextResponse.json({
    ok: true,
    sentTo: coach.email,
    via: sent.via,
    warning: sent.warning ?? null,
    lastInvitedAt: sentAt,
  })
}
