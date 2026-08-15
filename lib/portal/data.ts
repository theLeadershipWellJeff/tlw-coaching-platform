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

/** How many upcoming sessions the home page lists. */
const UPCOMING_LIMIT = 5

export type PortalAppointment = { id: string; scheduled_at: string; duration_minutes: number }

export type PortalOverview = {
  client: { id: string; name: string; timezone: string | null }
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
}

export async function loadPortalOverview(clientId: string): Promise<PortalOverview | null> {
  const supabase = getSupabaseAdmin()

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, timezone, coaching_goals')
    .eq('id', clientId)
    .maybeSingle()
  if (!client) return null

  const nowIso = new Date().toISOString()
  const [apptRes, txRes, notesRes, commRes, coachRes] = await Promise.all([
    supabase
      .from('appointments')
      .select('id, scheduled_at, duration_minutes, status')
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
  const links = coachRes.data ?? []
  if (links.length > 0) {
    const primary = links.find((l) => l.role === 'primary') || links[0]
    const { data: coach } = await supabase
      .from('coaches')
      .select('booking_url')
      .eq('id', primary.coach_id)
      .maybeSingle()
    bookingUrl = coach?.booking_url ?? null
  }

  return {
    client: { id: client.id, name: client.name, timezone: client.timezone },
    goals: Array.isArray(client.coaching_goals) ? (client.coaching_goals as CoachingGoal[]) : [],
    appointments: (apptRes.data ?? []).map((a) => ({
      id: a.id,
      scheduled_at: a.scheduled_at,
      duration_minutes: a.duration_minutes,
    })),
    transcripts: txRes.data ?? [],
    sessionNotes: notesRes.data ?? [],
    messages: commRes.data ?? [],
    bookingUrl,
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
