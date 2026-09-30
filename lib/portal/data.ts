/**
 * Read-only overview data for the Client Portal home. EVERY query is hard-scoped
 * to the authenticated `clientId`, and only client-appropriate fields are read —
 * never `key_info` or any coach-private column.
 *
 * Session notes are a special case worth stating plainly: the portal NEVER reads
 * the `notes` table. A coach's note is a private working document. What the
 * client sees is the email the coach chose to send them — the
 * `type='session_note'` rows in `communications` (migration 050) — so the gate is
 * the coach's own "Send to client" action and nothing else.
 */
import { getSupabaseAdmin } from '@/lib/supabase/server'
import type { CoachingGoal } from '@/lib/supabase/types'
import { extractChangeLinks } from './appointment-links'
import { coachFirstName } from '@/lib/coach-scheduling'

/** How many upcoming sessions the home page lists. */
const UPCOMING_LIMIT = 5

export type PortalAppointment = {
  id: string
  scheduled_at: string
  duration_minutes: number
  /** The client's own reschedule / cancel links from the scheduler's calendar
   *  event (Calendly etc.), when present — lib/portal/appointment-links.ts. */
  rescheduleUrl: string | null
  cancelUrl: string | null
}

/** Who a client reaches to schedule: their assigned coach's booking link and/or assistant. */
export type PortalCoachContact = {
  name: string | null
  firstName: string | null
  bookingUrl: string | null
  assistantName: string | null
  assistantEmail: string | null
}

export type PortalOverview = {
  client: { id: string; name: string; timezone: string | null }
  /** How the portal addresses them: preferred_name (migration 061), else first name. */
  displayName: string
  /** First-visit tour taken (migration 053). */
  onboarded: boolean
  goals: CoachingGoal[]
  /** Soonest first. The first entry is the "next" session. */
  appointments: PortalAppointment[]
  transcripts: { id: string; title: string | null; session_date: string | null }[]
  /** Notes the coach sent to this client, newest first. */
  sessionNotes: { id: string; subject: string | null; preview: string | null; sent_at: string }[]
  /** Other outbound mail (nudges, one-off emails) — session notes excluded. */
  messages: { id: string; type: string; subject: string | null; preview: string | null; sent_at: string }[]
  /** The coach's client-facing scheduler link (migration 051), or null. */
  bookingUrl: string | null
  /** The assigned coach and how to schedule with them (051 + 074). null when
   *  nobody is coaching them (a portal participant's house link is structural). */
  coach: PortalCoachContact | null
  /** A coach is actually coaching them: a coach_clients link AND not a
   *  client_type 'portal' participant (whose house-coach link is structural).
   *  Decides which cards make sense to show. */
  hasCoach: boolean
  /** portal_features.assessments (migration 059) — the 360 surfaces are on. */
  assessmentsEnabled: boolean
}

export async function loadPortalOverview(clientId: string): Promise<PortalOverview | null> {
  const supabase = getSupabaseAdmin()

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, timezone, coaching_goals, client_type')
    .eq('id', clientId)
    .maybeSingle()
  if (!client) return null

  // Read the tour flag separately and defensively. Postgres errors the WHOLE
  // select on an unknown column, so folding `portal_onboarded` into the query
  // above would turn "migration 053 not applied yet" into "every client bounces
  // off their portal" — a deploy-order cliff this page must not have. Unknown =
  // treat as not-yet-onboarded, which just offers the tour.
  const onboarded = await supabase
    .from('clients')
    .select('portal_onboarded')
    .eq('id', clientId)
    .maybeSingle()
    .then(
      (r) => !!r.data?.portal_onboarded,
      () => false
    )
  // "What should I call you" (migration 061) — same defensive read; absent =
  // first name.
  const preferredName = await supabase
    .from('clients')
    .select('preferred_name')
    .eq('id', clientId)
    .maybeSingle()
    .then(
      (r) => (r.data?.preferred_name || '').trim() || null,
      () => null
    )
  // Same defensive read for the assessment flag (migration 059). Absent = off.
  const assessmentsEnabled = await supabase
    .from('clients')
    .select('portal_features')
    .eq('id', clientId)
    .maybeSingle()
    .then(
      (r) => (r.data?.portal_features as { assessments?: boolean } | null)?.assessments === true,
      () => false
    )

  const nowIso = new Date().toISOString()
  const [apptRes, txRes, notesRes, commRes, coachRes] = await Promise.all([
    supabase
      .from('appointments')
      .select('id, scheduled_at, duration_minutes, status, raw_event')
      .eq('client_id', clientId)
      .eq('status', 'scheduled')
      .gte('scheduled_at', nowIso)
      .order('scheduled_at', { ascending: true })
      .limit(UPCOMING_LIMIT),
    supabase
      .from('transcripts')
      .select('id, title, session_date')
      .eq('client_id', clientId)
      .order('session_date', { ascending: false, nullsFirst: false })
      .limit(20),
    // The notes the coach actually sent — never the `notes` table itself.
    supabase
      .from('communications')
      .select('id, subject, preview, sent_at')
      .eq('client_id', clientId)
      .eq('type', 'session_note')
      .eq('direction', 'outbound')
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
      .limit(20),
    // Everything else the coach sent. Session notes are excluded so they don't
    // appear twice — they have their own card.
    supabase
      .from('communications')
      .select('id, type, subject, preview, sent_at')
      .eq('client_id', clientId)
      .eq('direction', 'outbound')
      .eq('status', 'sent')
      .neq('type', 'session_note')
      .order('sent_at', { ascending: false })
      .limit(10),
    supabase.from('coach_clients').select('coach_id, role').eq('client_id', clientId),
  ])

  // The booking link comes from this client's primary coach (any linked coach as
  // a fallback) — the same resolution the portal's outbound email uses.
  let bookingUrl: string | null = null
  let coachContact: PortalCoachContact | null = null
  const links = coachRes.data ?? []
  const hasCoach = links.length > 0 && client.client_type !== 'portal'
  if (links.length > 0) {
    const primary = links.find((l) => l.role === 'primary') || links[0]
    const { data: coach } = await supabase
      .from('coaches')
      .select('name, booking_url')
      .eq('id', primary.coach_id)
      .maybeSingle()
    bookingUrl = coach?.booking_url ?? null
    if (hasCoach && coach) {
      // Scheduling assistant (migration 074) — read on its own so a missing
      // column costs only the assistant, never the portal.
      const assistant = await supabase
        .from('coaches')
        .select('scheduling_assistant_name, scheduling_assistant_email')
        .eq('id', primary.coach_id)
        .maybeSingle()
        .then(
          (r) => (r.error ? null : (r.data as { scheduling_assistant_name: string | null; scheduling_assistant_email: string | null } | null)),
          () => null
        )
      coachContact = {
        name: coach.name || null,
        firstName: coachFirstName(coach.name),
        bookingUrl,
        assistantName: assistant?.scheduling_assistant_name ?? null,
        assistantEmail: assistant?.scheduling_assistant_email ?? null,
      }
    }
  }

  return {
    client: { id: client.id, name: client.name, timezone: client.timezone },
    displayName: preferredName || (client.name || '').split(' ')[0] || 'there',
    onboarded,
    goals: Array.isArray(client.coaching_goals) ? (client.coaching_goals as CoachingGoal[]) : [],
    appointments: (apptRes.data ?? []).map((a) => ({
      id: a.id,
      scheduled_at: a.scheduled_at,
      duration_minutes: a.duration_minutes,
      ...extractChangeLinks((a as { raw_event?: unknown }).raw_event),
    })),
    transcripts: txRes.data ?? [],
    sessionNotes: notesRes.data ?? [],
    messages: commRes.data ?? [],
    bookingUrl,
    coach: coachContact,
    // A standalone / enterprise participant (client_type 'portal') is linked to
    // the house coach so the tenant gates work, but nobody is coaching them —
    // the portal must not offer "your coach" they do not have.
    hasCoach,
    assessmentsEnabled,
  }
}

/**
 * Load one sent note for this client. Scoped to BOTH the note id and the
 * authenticated clientId, and to `type='session_note'`, so this can never be
 * used to read another client's mail — or this client's billing/receipt mail.
 */
export async function loadPortalSessionNote(
  clientId: string,
  noteCommunicationId: string
): Promise<{ id: string; subject: string | null; body_html: string | null; sent_at: string } | null> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('communications')
    .select('id, subject, body_html, sent_at')
    .eq('id', noteCommunicationId)
    .eq('client_id', clientId)
    .eq('type', 'session_note')
    .eq('direction', 'outbound')
    .eq('status', 'sent')
    .maybeSingle()
  return data ?? null
}

/** Load one of this client's own session transcripts. Scoped to the client. */
export async function loadPortalTranscript(
  clientId: string,
  transcriptId: string
): Promise<{ id: string; title: string | null; session_date: string | null; raw_md: string } | null> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('transcripts')
    .select('id, title, session_date, raw_md')
    .eq('id', transcriptId)
    .eq('client_id', clientId)
    .maybeSingle()
  if (!data) return null
  return { ...data, raw_md: data.raw_md || '' }
}
