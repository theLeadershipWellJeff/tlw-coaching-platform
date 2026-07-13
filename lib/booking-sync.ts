/**
 * External booking capture — Calendly / HubSpot → "Next Appointment".
 *
 * Jeff hands an overwhelmed client his Calendly or HubSpot link to book the next
 * session later. Both tools write the booking to his Google Calendar (client as a
 * guest), the same calendar the native "Schedule next session" modal writes to. So
 * Google Calendar is the single source of truth: we capture bookings by reading the
 * calendar incrementally, not by wiring two provider webhooks. Reschedules and
 * cancellations propagate for free (the event moves/disappears in the next delta).
 *
 * Each run pulls the calendar delta (lib/calendar.ts#listCalendarDelta), classifies
 * every changed event, and UPSERTS into `appointments` keyed by (coach_id,
 * google_event_id) — idempotent, so replaying a delta never duplicates a row. A
 * booking we can't tie to a roster client is kept as a client_id-null row (the
 * unmatched review queue) rather than silently dropped.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Appointment, Coach, Database } from './supabase/types'
import {
  listCalendarDelta,
  matchEventToClient,
  detectBookingSource,
  extractEventMeetingLink,
  type RosterClientWithEmail,
} from './calendar'

export interface BookingSyncResult {
  coachId: string
  discovered: number // brand-new session rows created (matched to a client)
  updated: number // existing rows whose time/status/client changed
  cancelled: number // events deleted/cancelled on the calendar
  unmatched: number // captured but couldn't resolve to a client (review queue)
  fullResync: boolean
}

type ExistingRow = Pick<Appointment, 'id' | 'client_id' | 'status' | 'source' | 'google_event_id' | 'meeting_link'>

const ZERO = (coachId: string, fullResync = false): BookingSyncResult => ({
  coachId,
  discovered: 0,
  updated: 0,
  cancelled: 0,
  unmatched: 0,
  fullResync,
})

/** The coach's roster (id/name/email) — the match set for calendar events. */
async function loadRoster(
  supabase: SupabaseClient<Database>,
  coachId: string
): Promise<RosterClientWithEmail[]> {
  const { data: links } = await supabase.from('coach_clients').select('client_id').eq('coach_id', coachId)
  const ids = (links || []).map((l) => l.client_id)
  if (ids.length === 0) return []
  const { data: clients } = await supabase.from('clients').select('id, name, email').in('id', ids)
  return (clients || []).map((c) => ({ id: c.id, name: c.name, email: c.email }))
}

export async function syncExternalBookings(
  supabase: SupabaseClient<Database>,
  coach: Coach
): Promise<BookingSyncResult> {
  if (!coach.google_refresh_token) return ZERO(coach.id)

  const delta = await listCalendarDelta(coach, coach.calendar_sync_token)
  const result = ZERO(coach.id, delta.fullResync)

  if (delta.events.length > 0) {
    const roster = await loadRoster(supabase, coach.id)

    // Pull the existing rows for the events in this delta in one query, so we can
    // tell new bookings from updates and preserve a native row's identity.
    const eventIds = Array.from(
      new Set(delta.events.map((e: any) => e.id).filter(Boolean) as string[])
    )
    const existing = new Map<string, ExistingRow>()
    if (eventIds.length > 0) {
      const { data: rows } = await supabase
        .from('appointments')
        .select('id, client_id, status, source, google_event_id, meeting_link')
        .eq('coach_id', coach.id)
        .in('google_event_id', eventIds)
      for (const r of rows || []) if (r.google_event_id) existing.set(r.google_event_id, r as ExistingRow)
    }

    const toWrite: Record<string, unknown>[] = []
    const cancelledIds: string[] = [] // updated directly by id (no scheduled_at to upsert)
    for (const event of delta.events) {
      const eventId: string = event.id || ''
      if (!eventId) continue
      const prior = existing.get(eventId)

      // Cancelled / deleted: mark a known row cancelled; ignore an unknown one. A
      // delete carries no time, so we can't upsert it (scheduled_at is NOT NULL) —
      // update the existing row by id instead.
      if (event.status === 'cancelled') {
        if (prior && prior.status !== 'cancelled' && prior.status !== 'ignored') {
          cancelledIds.push(prior.id)
          result.cancelled++
        }
        continue
      }

      // Only timed events are sessions; skip all-day blocks.
      const startIso: string | undefined = event.start?.dateTime
      const endIso: string | undefined = event.end?.dateTime
      if (!startIso) continue
      const durationMinutes =
        startIso && endIso
          ? Math.max(1, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000))
          : 60

      const match = matchEventToClient(coach, event, roster)

      // Is this a coaching session at all? Yes if it matches a client, or it's
      // already in our table (native or previously captured), or it has a real
      // non-coach guest with an email (a booking we should surface to be assigned).
      const isSession = !!match.clientId || !!prior || !!match.guestEmail
      if (!isSession) continue

      // Preserve a native row's source and an already-resolved client; never
      // overwrite a match with null. Keep any terminal prior status (ignored /
      // cancelled / completed) so a re-seen event can't resurrect it.
      const source = prior ? (prior.source === 'native' ? 'native' : prior.source) : detectBookingSource(event)
      const clientId = prior?.client_id ?? match.clientId
      const status = prior && prior.status !== 'scheduled' ? prior.status : 'scheduled'

      toWrite.push({
        coach_id: coach.id,
        google_event_id: eventId,
        client_id: clientId,
        scheduled_at: new Date(startIso).toISOString(),
        duration_minutes: durationMinutes,
        title: event.summary || null,
        // Join link off the event (conferenceData/location/description) — how a
        // Calendly/HubSpot booking's Zoom link reaches the reminder emails. Keep
        // a previously stored link when the event doesn't carry one.
        meeting_link: extractEventMeetingLink(event) ?? prior?.meeting_link ?? null,
        attendee_email: match.guestEmail,
        source,
        status,
        raw_event: event,
      })

      if (prior) result.updated++
      else if (clientId) result.discovered++
      else result.unmatched++
    }

    if (toWrite.length > 0) {
      const { error } = await supabase
        .from('appointments')
        .upsert(toWrite as never, { onConflict: 'coach_id,google_event_id' })
      if (error) console.error(`[booking-sync] upsert failed for coach ${coach.id}:`, error.message)
    }
    if (cancelledIds.length > 0) {
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'cancelled' })
        .in('id', cancelledIds)
      if (error) console.error(`[booking-sync] cancel update failed for coach ${coach.id}:`, error.message)
    }
  }

  // Advance the cursor (only when Google gave us a fresh one — otherwise keep the
  // old token so the next run retries rather than full-resyncing).
  if (delta.nextSyncToken) {
    await supabase
      .from('coaches')
      .update({ calendar_sync_token: delta.nextSyncToken, calendar_synced_at: new Date().toISOString() })
      .eq('id', coach.id)
  }

  console.log(
    `[booking-sync] coach=${coach.id} discovered=${result.discovered} updated=${result.updated} ` +
      `cancelled=${result.cancelled} unmatched=${result.unmatched} fullResync=${result.fullResync}`
  )
  return result
}
