import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireSupervisor, toErrorResponse } from '@/lib/api-handler'
import { loadPortalStates } from '@/lib/admin/portal-status'
import { logAdminAction } from '@/lib/admin/audit'

export const runtime = 'nodejs'

// Coach management is supervisor-only: listing every coach (with client/account
// counts), and adding coaches, are firm-admin operations — an ordinary coach
// must not see or manage colleagues (ISOLATION_AUDIT Decision #2).

/** Per-coach usage rollup returned to the supervisor "My Team" page. */
export type CoachUsage = {
  transcript_count: number
  report_count: number
  note_count: number
  email_count: number
  appointment_count: number
  nudge_sent_count: number
  last_active_at: string | null
}

function bump(map: Record<string, number>, key: string | null | undefined) {
  if (!key) return
  map[key] = (map[key] ?? 0) + 1
}

function later(map: Record<string, string>, key: string | null | undefined, ts: string | null | undefined) {
  if (!key || !ts) return
  if (!map[key] || ts > map[key]) map[key] = ts
}

export async function GET() {
  const supabase = getSupabaseAdmin()
  let coach
  try {
    coach = await requireSupervisor(supabase)
  } catch (e) {
    return toErrorResponse(e)
  }

  const { data, error } = await supabase
    .from('coaches')
    .select(
      'id, name, email, role, created_at, timezone, google_refresh_token, plan, plan_note, subscription_status, stripe_subscription_id'
    )
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const coachIds = (data ?? []).map((c: any) => c.id)

  // Usage rollups, aggregated in JS. Each query pulls only (coach_id, timestamp)
  // tuples — fine at practice scale (a handful of coaches, hundreds of rows per
  // table). Revisit with a SQL rollup (rpc) if the firm ever outgrows that.
  const [clientLinks, accountRows, transcriptRows, reportRows, commRows, apptRows, nudgeRows] =
    await Promise.all([
      supabase.from('coach_clients').select('coach_id, client_id').in('coach_id', coachIds),
      supabase.from('billing_accounts' as any).select('coach_id, status').in('coach_id', coachIds),
      supabase.from('transcripts').select('coach_id, created_at').in('coach_id', coachIds),
      supabase.from('session_reports').select('coach_id, created_at').in('coach_id', coachIds),
      supabase
        .from('communications')
        .select('coach_id, type, direction, status, sent_at')
        .in('coach_id', coachIds),
      supabase.from('appointments').select('coach_id, status, created_at').in('coach_id', coachIds),
      supabase.from('nudges' as any).select('coach_id, status, sent_at').in('coach_id', coachIds),
    ])

  const clientsByCoach: Record<string, number> = {}
  // client -> coach links, for attributing client-scoped notes to coaches. A
  // shared client's notes count for every linked coach (each sees that work).
  const coachesByClient: Record<string, string[]> = {}
  for (const row of (clientLinks.data ?? []) as any[]) {
    bump(clientsByCoach, row.coach_id)
    ;(coachesByClient[row.client_id] ??= []).push(row.coach_id)
  }

  const accountsByCoach: Record<string, number> = {}
  for (const row of (accountRows.data ?? []) as any[]) {
    if (row.status === 'active') bump(accountsByCoach, row.coach_id)
  }

  const transcriptsByCoach: Record<string, number> = {}
  const reportsByCoach: Record<string, number> = {}
  const emailsByCoach: Record<string, number> = {}
  const apptsByCoach: Record<string, number> = {}
  const nudgesByCoach: Record<string, number> = {}
  const notesByCoach: Record<string, number> = {}
  const lastActive: Record<string, string> = {}

  for (const row of (transcriptRows.data ?? []) as any[]) {
    bump(transcriptsByCoach, row.coach_id)
    later(lastActive, row.coach_id, row.created_at)
  }
  for (const row of (reportRows.data ?? []) as any[]) {
    bump(reportsByCoach, row.coach_id)
    later(lastActive, row.coach_id, row.created_at)
  }
  for (const row of (commRows.data ?? []) as any[]) {
    // "Emails sent" = outbound sends that succeeded, any type (email, reminder,
    // nudge, receipt…) — the coach's outward activity through the app.
    if (row.direction === 'outbound' && row.status === 'sent') bump(emailsByCoach, row.coach_id)
    later(lastActive, row.coach_id, row.sent_at)
  }
  for (const row of (apptRows.data ?? []) as any[]) {
    if (row.status === 'scheduled' || row.status === 'completed') bump(apptsByCoach, row.coach_id)
    later(lastActive, row.coach_id, row.created_at)
  }
  for (const row of (nudgeRows.data ?? []) as any[]) {
    if (row.status === 'sent') bump(nudgesByCoach, row.coach_id)
    later(lastActive, row.coach_id, row.sent_at)
  }

  // Portal adoption: which of each coach's clients have been invited to the
  // Client Portal, and which have actually signed in. Shared clients count for
  // every linked coach, mirroring the notes attribution below.
  const allClientIdsForPortal = Object.keys(coachesByClient)
  const portalStates = await loadPortalStates(supabase, allClientIdsForPortal)
  const portalInvitedByCoach: Record<string, number> = {}
  const portalActiveByCoach: Record<string, number> = {}
  for (const [clientId, state] of Object.entries(portalStates)) {
    for (const cid of coachesByClient[clientId] ?? []) {
      if (state.invitedAt) bump(portalInvitedByCoach, cid)
      if (state.lastSeenAt) bump(portalActiveByCoach, cid)
    }
  }

  // Notes are client-scoped (no coach_id) — attribute through coach_clients.
  const allClientIds = allClientIdsForPortal
  if (allClientIds.length > 0) {
    const { data: noteRows } = await supabase
      .from('notes')
      .select('client_id, created_at')
      .in('client_id', allClientIds)
    for (const row of (noteRows ?? []) as any[]) {
      for (const cid of coachesByClient[row.client_id] ?? []) {
        bump(notesByCoach, cid)
        later(lastActive, cid, row.created_at)
      }
    }
  }

  const coaches = (data ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    role: c.role,
    created_at: c.created_at,
    timezone: c.timezone,
    client_count: clientsByCoach[c.id] ?? 0,
    account_count: accountsByCoach[c.id] ?? 0,
    // Command Center (migration 057): plan label + coach-subscription state.
    plan: c.plan ?? 'beta',
    plan_note: c.plan_note ?? null,
    subscription_status: c.subscription_status ?? null,
    has_subscription: !!c.stripe_subscription_id,
    portal_invited_count: portalInvitedByCoach[c.id] ?? 0,
    portal_active_count: portalActiveByCoach[c.id] ?? 0,
    // A coach row can be pre-created from the Add-coach modal; the refresh token
    // only exists once they've actually signed in with Google and consented.
    has_signed_in: !!c.google_refresh_token,
    usage: {
      transcript_count: transcriptsByCoach[c.id] ?? 0,
      report_count: reportsByCoach[c.id] ?? 0,
      note_count: notesByCoach[c.id] ?? 0,
      email_count: emailsByCoach[c.id] ?? 0,
      appointment_count: apptsByCoach[c.id] ?? 0,
      nudge_sent_count: nudgesByCoach[c.id] ?? 0,
      last_active_at: lastActive[c.id] ?? null,
    } satisfies CoachUsage,
    is_me: c.id === coach.id,
  }))

  return NextResponse.json({ coaches })
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin()
  let actor
  try {
    actor = await requireSupervisor(supabase)
  } catch (e) {
    return toErrorResponse(e)
  }

  const body = await req.json().catch(() => ({}))
  const name = (body?.name as string | undefined)?.trim()
  const email = (body?.email as string | undefined)?.trim().toLowerCase()
  const role = body?.role === 'supervisor' ? 'supervisor' : 'coach'

  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return NextResponse.json({ error: 'valid email is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('coaches')
    .insert({ name, email, role, timezone: '' } as any)
    .select('id, name, email, role, created_at, timezone, plan, plan_note, subscription_status')
    .single()

  if (error) {
    if (error.code === '23505')
      return NextResponse.json({ error: 'A coach with that email already exists' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logAdminAction(supabase, {
    actorCoachId: actor.id,
    action: 'coach_added',
    targetCoachId: (data as any).id,
    detail: { email, role },
  })

  return NextResponse.json({ coach: data }, { status: 201 })
}
