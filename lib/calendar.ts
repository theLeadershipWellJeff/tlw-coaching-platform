/**
 * Match a transcript to a client by its timestamp.
 *
 * Plaud names transcripts with a bare local timestamp. We convert that wall
 * clock (in the coach's timezone) to an absolute instant, find the Google
 * Calendar event that brackets it, and read the client off the event's guest —
 * preferring the non-coach attendee's email (an exact roster match) and falling
 * back to the attendee/title name. Reads the calendar server-side using the
 * coach's stored refresh token, so it works in the unattended webhook.
 */
import { google } from 'googleapis'
import type { Coach } from './supabase/types'
import { matchClient, type RosterClient } from './transcripts/match'

export interface RosterClientWithEmail extends RosterClient {
  email: string | null
}

export interface CalendarMatch {
  clientId: string | null
  confidence: number
  status: 'matched' | 'needs_review' | 'unmatched'
  via: 'attendee_email' | 'attendee_name' | 'event_title' | 'none'
  eventTitle: string | null
  eventStart: string | null
}

// How far on either side of an event we still consider the recording "inside"
// it — absorbs the gap between the calendar start and hitting record, and runover.
const EVENT_PAD_MS = 20 * 60 * 1000
// Window to pull candidate events around the timestamp.
const SEARCH_WINDOW_MS = 3 * 60 * 60 * 1000

/** Offset (ms) of a timezone at a given instant, via Intl (DST-correct). */
function tzOffsetMs(at: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const p: Record<string, string> = {}
  for (const part of dtf.formatToParts(at)) p[part.type] = part.value
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return asUTC - at.getTime()
}

/**
 * Interpret "YYYY-MM-DD HH:MM(:SS)" as wall-clock time in `timeZone` and return
 * the absolute instant. Two-pass to stay correct across DST boundaries.
 */
export function zonedWallClockToUtc(dateStr: string, timeStr: string, timeZone: string): Date | null {
  const d = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/)
  const t = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (!d || !t) return null
  const wallMs = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2], t[3] ? +t[3] : 0)
  const guess = new Date(wallMs)
  const offset = tzOffsetMs(guess, timeZone)
  return new Date(wallMs - offset)
}

function coachEmails(coach: Coach): string[] {
  return [
    coach.email,
    process.env.JEFF_FROM_EMAIL,
    process.env.JEFF_CC_EMAIL,
  ]
    .filter(Boolean)
    .map((e) => (e as string).toLowerCase())
}

const NONE: CalendarMatch = {
  clientId: null,
  confidence: 0,
  status: 'needs_review',
  via: 'none',
  eventTitle: null,
  eventStart: null,
}

export async function findClientFromCalendar(
  coach: Coach,
  sessionInstant: Date,
  clients: RosterClientWithEmail[]
): Promise<CalendarMatch> {
  if (!coach.google_refresh_token) return { ...NONE, status: 'needs_review' }

  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: coach.google_refresh_token })
  const calendar = google.calendar({ version: 'v3', auth })

  let items: any[] = []
  try {
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date(sessionInstant.getTime() - SEARCH_WINDOW_MS).toISOString(),
      timeMax: new Date(sessionInstant.getTime() + SEARCH_WINDOW_MS).toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50,
    })
    items = res.data.items || []
  } catch (e) {
    console.error('Calendar lookup failed:', e)
    return { ...NONE, status: 'needs_review' }
  }

  // Events whose padded [start, end] range contains the recording instant.
  const ts = sessionInstant.getTime()
  const overlapping = items
    .map((e) => {
      const startIso = e.start?.dateTime || e.start?.date
      const endIso = e.end?.dateTime || e.end?.date || startIso
      const start = startIso ? new Date(startIso).getTime() : NaN
      const end = endIso ? new Date(endIso).getTime() : NaN
      return { e, start, end }
    })
    .filter(({ start, end }) => Number.isFinite(start) && ts >= start - EVENT_PAD_MS && ts <= end + EVENT_PAD_MS)
    .sort((a, b) => Math.abs(a.start - ts) - Math.abs(b.start - ts))

  const mine = coachEmails(coach)
  // Prefer the closest event that actually has a non-coach guest.
  const chosen =
    overlapping.find(({ e }) =>
      (e.attendees || []).some((a: any) => a.email && !mine.includes(a.email.toLowerCase()))
    ) || overlapping[0]
  if (!chosen) return NONE

  const event = chosen.e
  const eventTitle: string = event.summary || ''
  const eventStart: string = event.start?.dateTime || event.start?.date || ''
  const guest = (event.attendees || []).find(
    (a: any) => a.email && !mine.includes(a.email.toLowerCase())
  )

  // 1) Exact roster match on the guest's email — the most reliable signal.
  if (guest?.email) {
    const email = guest.email.toLowerCase()
    const byEmail = clients.find((c) => c.email && c.email.toLowerCase() === email)
    if (byEmail) {
      return { clientId: byEmail.id, confidence: 1, status: 'matched', via: 'attendee_email', eventTitle, eventStart }
    }
  }

  // 2) Fall back to a name match — guest display name, then event title.
  const roster: RosterClient[] = clients.map((c) => ({ id: c.id, name: c.name }))
  for (const [name, via] of [
    [guest?.displayName as string | undefined, 'attendee_name' as const],
    [eventTitle, 'event_title' as const],
  ] as const) {
    if (!name) continue
    const m = matchClient(name, roster)
    if (m.status === 'matched' && m.clientId) {
      return { clientId: m.clientId, confidence: m.confidence, status: 'matched', via, eventTitle, eventStart }
    }
  }

  // Found the event but couldn't tie it to a roster client — fail loud.
  return { clientId: null, confidence: 0, status: 'needs_review', via: 'none', eventTitle, eventStart }
}

/**
 * Create a Google Calendar event on the coach's primary calendar for a booked
 * session, with the client as a guest (so Google also emails them the invite).
 * Writes server-side using the coach's stored refresh token — requires the
 * `calendar.events` scope (the coach must re-consent once after it was added).
 * Best-effort: returns the new event id, or null if the write failed, so a
 * calendar hiccup never blocks recording the appointment.
 */
export async function createClientEvent(
  coach: Coach,
  opts: {
    summary: string
    startsAt: Date
    durationMinutes: number
    attendeeEmail?: string | null
    description?: string
    /** Zoom (or other) join link — written as the event's location and appended
     *  to the description, so the invite the client receives carries it. */
    meetingLink?: string | null
  }
): Promise<string | null> {
  if (!coach.google_refresh_token) return null

  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: coach.google_refresh_token })
  const calendar = google.calendar({ version: 'v3', auth })

  const end = new Date(opts.startsAt.getTime() + opts.durationMinutes * 60 * 1000)
  const attendees = opts.attendeeEmail ? [{ email: opts.attendeeEmail }] : undefined
  const description = opts.meetingLink
    ? `${opts.description || ''}${opts.description ? '\n\n' : ''}Join the meeting:\n${opts.meetingLink}`
    : opts.description

  try {
    const res = await calendar.events.insert({
      calendarId: 'primary',
      sendUpdates: 'all',
      requestBody: {
        summary: opts.summary,
        description,
        location: opts.meetingLink || undefined,
        start: { dateTime: opts.startsAt.toISOString(), timeZone: coach.timezone },
        end: { dateTime: end.toISOString(), timeZone: coach.timezone },
        attendees,
      },
    })
    return res.data.id || null
  } catch (e) {
    console.error('Calendar event create failed:', e)
    return null
  }
}

// Matches the first meeting URL in free text (Zoom / Meet / Teams / Webex /
// GoToMeeting). Deliberately provider-scoped so we never mistake an ordinary
// link in an event description for the join link.
const MEETING_URL_RE =
  /https?:\/\/[^\s<>"']*(?:zoom\.us|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|webex\.com|gotomeeting\.com)[^\s<>"']*/i

/**
 * Best-effort join link off a calendar event: Google conferenceData first (a
 * real video entry point), then a meeting URL in the location, then one in the
 * description. Used by the external-booking sync so Calendly/HubSpot bookings —
 * which embed the Zoom link in the event — carry it into reminder emails.
 */
export function extractEventMeetingLink(event: any): string | null {
  const video = (event?.conferenceData?.entryPoints || []).find(
    (p: any) => p?.entryPointType === 'video' && p?.uri
  )
  if (video?.uri) return video.uri as string

  for (const text of [event?.location, event?.description]) {
    if (typeof text !== 'string') continue
    const m = text.match(MEETING_URL_RE)
    if (m) return m[0]
  }
  return null
}

export interface EventState {
  /** false = the event was deleted (404). */
  found: boolean
  /** true = the event exists but is cancelled. */
  cancelled: boolean
  /** The event's current start, or null if it couldn't be read (leave as-is). */
  startsAt: Date | null
  durationMinutes: number | null
}

/**
 * Read an event's current state so an appointment can track calendar edits (the
 * coach drags the session to a new time in Google Calendar). Returns the live
 * start so callers can shift the stored time — and the 24h reminder — with it.
 * A 404 means the event was deleted; any other read failure returns
 * found/!cancelled with no time, so we never cancel or move on a transient error.
 */
export async function getClientEventState(coach: Coach, eventId: string): Promise<EventState> {
  const unknown: EventState = { found: true, cancelled: false, startsAt: null, durationMinutes: null }
  if (!coach.google_refresh_token || !eventId) return unknown

  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: coach.google_refresh_token })
  const calendar = google.calendar({ version: 'v3', auth })

  try {
    const res = await calendar.events.get({ calendarId: 'primary', eventId })
    const e = res.data
    const startIso = e.start?.dateTime || null
    const endIso = e.end?.dateTime || null
    const startsAt = startIso ? new Date(startIso) : null
    const durationMinutes =
      startIso && endIso ? Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000) : null
    return { found: true, cancelled: e.status === 'cancelled', startsAt, durationMinutes }
  } catch (e: any) {
    if (Number(e?.code) === 404 || e?.response?.status === 404) {
      return { found: false, cancelled: true, startsAt: null, durationMinutes: null }
    }
    console.error('Calendar event get failed:', e)
    return unknown
  }
}

export interface ConflictResult {
  /** false = we couldn't read the calendar (no token / API error) — caller
   *  should not treat this as "free" or "busy", just "unchecked". */
  checked: boolean
  /** true = the proposed window overlaps a busy block on the coach's calendar. */
  busy: boolean
  /** Up to a couple of conflicting busy intervals (ISO), for a helpful note. */
  conflicts: { start: string; end: string }[]
}

/**
 * Ask Google whether the coach's primary calendar is busy during [startsAt, end).
 * Uses the freebusy endpoint (covered by the already-granted `calendar.readonly`
 * scope — no re-consent), so it sees every busy block, not just app-created
 * events. Best-effort: a read failure returns `checked: false` so the scheduler
 * degrades to "couldn't verify" rather than wrongly blocking or clearing a slot.
 */
export async function getCalendarConflicts(
  coach: Coach,
  startsAt: Date,
  endsAt: Date
): Promise<ConflictResult> {
  const unchecked: ConflictResult = { checked: false, busy: false, conflicts: [] }
  if (!coach.google_refresh_token) return unchecked

  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: coach.google_refresh_token })
  const calendar = google.calendar({ version: 'v3', auth })

  try {
    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin: startsAt.toISOString(),
        timeMax: endsAt.toISOString(),
        items: [{ id: 'primary' }],
      },
    })
    const busyBlocks = res.data.calendars?.primary?.busy || []
    const conflicts = busyBlocks
      .filter((b) => b.start && b.end)
      .map((b) => ({ start: b.start as string, end: b.end as string }))
    return { checked: true, busy: conflicts.length > 0, conflicts: conflicts.slice(0, 2) }
  } catch (e) {
    console.error('Calendar freebusy query failed:', e)
    return unchecked
  }
}

/** Delete a calendar event the app created (best-effort; notifies guests). */
export async function deleteClientEvent(coach: Coach, eventId: string): Promise<void> {
  if (!coach.google_refresh_token || !eventId) return
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: coach.google_refresh_token })
  const calendar = google.calendar({ version: 'v3', auth })
  try {
    await calendar.events.delete({ calendarId: 'primary', eventId, sendUpdates: 'all' })
  } catch (e) {
    console.error('Calendar event delete failed:', e)
  }
}

export interface MatchedEvent {
  eventId: string
  clientId: string | null
  start: string | null
  durationMinutes: number
}

/**
 * List the coach's calendar events in [timeMin, timeMax) and tie each to a
 * roster client — email first (exact match on the non-coach guest), then a name
 * match on the guest/title. Used by the Practice revenue projection: each event
 * that maps to a client counts as one upcoming session. Events without a
 * non-coach guest (focus blocks, personal events) and unmatched ones are
 * returned with clientId = null so callers can ignore them.
 */
export async function listClientMatchedEvents(
  coach: Coach,
  timeMin: Date,
  timeMax: Date,
  clients: RosterClientWithEmail[]
): Promise<MatchedEvent[]> {
  if (!coach.google_refresh_token) return []

  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: coach.google_refresh_token })
  const calendar = google.calendar({ version: 'v3', auth })

  let items: any[] = []
  try {
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
    })
    items = res.data.items || []
  } catch (e) {
    console.error('Calendar revenue lookup failed:', e)
    return []
  }

  const mine = coachEmails(coach)
  const roster: RosterClient[] = clients.map((c) => ({ id: c.id, name: c.name }))

  return items.map((event) => {
    const eventId: string = event.id || ''
    const start: string | null = event.start?.dateTime || event.start?.date || null
    // Scheduled length in minutes; defaults to an hour for events without times.
    const startMs = event.start?.dateTime ? new Date(event.start.dateTime).getTime() : NaN
    const endMs = event.end?.dateTime ? new Date(event.end.dateTime).getTime() : NaN
    const durationMinutes =
      Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
        ? Math.round((endMs - startMs) / 60000)
        : 60
    const guest = (event.attendees || []).find(
      (a: any) => a.email && !mine.includes(a.email.toLowerCase())
    )

    let clientId: string | null = null
    if (guest?.email) {
      const email = guest.email.toLowerCase()
      clientId = clients.find((c) => c.email && c.email.toLowerCase() === email)?.id || null
    }
    if (!clientId) {
      for (const name of [guest?.displayName as string | undefined, event.summary as string | undefined]) {
        if (!name) continue
        const m = matchClient(name, roster)
        if (m.status === 'matched' && m.clientId) {
          clientId = m.clientId
          break
        }
      }
    }
    return { eventId, clientId, start, durationMinutes }
  })
}

/** A timed calendar event, kept light for the dashboard heat-map (booked load). */
export interface CalendarEventLite {
  id: string
  title: string
  start: string | null // ISO datetime
  durationMinutes: number
}

/**
 * List the coach's timed calendar events in a window (for the dashboard
 * Calendar heat-map's booked-hours/day aggregation). All-day events carry no
 * booked time, so they're skipped. The window is at most ~5–6 weeks, so the
 * single 250-event page is ample (no pagination needed).
 */
export async function listCalendarEvents(
  coach: Coach,
  timeMin: Date,
  timeMax: Date
): Promise<CalendarEventLite[]> {
  if (!coach.google_refresh_token) return []

  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: coach.google_refresh_token })
  const calendar = google.calendar({ version: 'v3', auth })

  let items: any[] = []
  try {
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
    })
    items = res.data.items || []
  } catch (e) {
    console.error('Calendar heat-map lookup failed:', e)
    return []
  }

  const out: CalendarEventLite[] = []
  for (const event of items) {
    const start: string | null = event.start?.dateTime || null // skip all-day (date only)
    if (!start) continue
    const startMs = new Date(start).getTime()
    const endMs = event.end?.dateTime ? new Date(event.end.dateTime).getTime() : NaN
    const durationMinutes =
      Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
        ? Math.round((endMs - startMs) / 60000)
        : 60
    out.push({ id: event.id || '', title: event.summary || '(no title)', start, durationMinutes })
  }
  return out
}

// ── External booking capture (Calendly / HubSpot) ──────────────────────────────
// We don't integrate either provider directly — both already write the booking to
// the coach's Google Calendar (client as guest), so we capture bookings by watching
// the calendar incrementally. One events.list with a stored syncToken returns only
// the delta (new/changed/cancelled) since last run.

export interface CalendarDelta {
  /** Raw event resources in the delta. Cancelled/deleted events come through with
   *  status === 'cancelled' (we pass showDeleted: true). */
  events: any[]
  /** The cursor to store for next time; null if Google didn't return one. */
  nextSyncToken: string | null
  /** true = a stale token was dropped and we did a fresh full read. */
  fullResync: boolean
}

/**
 * Incremental calendar read. With a stored `syncToken` Google returns only what
 * changed since last sync; without one (or on a 410 Gone — an expired token) we do
 * a full read from `timeMin` and capture a fresh token. Pages through to the last
 * page, where Google returns `nextSyncToken`. `singleEvents: true` expands any
 * recurring series; `showDeleted: true` so cancellations surface.
 */
export async function listCalendarDelta(coach: Coach, syncToken: string | null): Promise<CalendarDelta> {
  if (!coach.google_refresh_token) return { events: [], nextSyncToken: syncToken, fullResync: false }

  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: coach.google_refresh_token })
  const calendar = google.calendar({ version: 'v3', auth })

  // Full read floor — a couple of days back so a session just moved earlier is still
  // seen. Only used when there's no token (initial / post-410); a syncToken can't be
  // combined with timeMin, so the token's window is fixed from this first read.
  const timeMin = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()

  async function pull(token: string | null, fullResync: boolean): Promise<CalendarDelta> {
    const events: any[] = []
    let pageToken: string | undefined
    let nextSyncToken: string | null = null
    do {
      const res = await calendar.events.list({
        calendarId: 'primary',
        singleEvents: true,
        showDeleted: true,
        maxResults: 250,
        ...(token ? { syncToken: token } : { timeMin, orderBy: 'startTime' }),
        ...(pageToken ? { pageToken } : {}),
      })
      events.push(...(res.data.items || []))
      pageToken = res.data.nextPageToken || undefined
      nextSyncToken = res.data.nextSyncToken || nextSyncToken
    } while (pageToken)
    return { events, nextSyncToken, fullResync }
  }

  try {
    return await pull(syncToken, false)
  } catch (e: any) {
    const status = Number(e?.code) || Number(e?.response?.status)
    if (syncToken && status === 410) {
      // Stale token — Google wants a full resync. Drop it and read fresh.
      try {
        return await pull(null, true)
      } catch (e2) {
        console.error('Calendar full resync failed:', e2)
        return { events: [], nextSyncToken: null, fullResync: true }
      }
    }
    console.error('Calendar delta list failed:', e)
    return { events: [], nextSyncToken: syncToken, fullResync: false }
  }
}

export interface EventClientMatch {
  clientId: string | null
  via: 'attendee_email' | 'attendee_name' | 'event_title' | 'none'
  /** The non-coach guest's email (the match key), if the event has one. */
  guestEmail: string | null
  guestName: string | null
}

/**
 * Tie one calendar event to a roster client the same way the transcript matcher
 * does: the non-coach guest's email (exact roster match) first, then a fuzzy name
 * match on the guest's display name, then the event title. Returns the guest email/
 * name even when unmatched, so callers can route a genuine booking we couldn't
 * resolve into the review queue (instead of silently dropping it).
 */
export function matchEventToClient(
  coach: Coach,
  event: any,
  clients: RosterClientWithEmail[]
): EventClientMatch {
  const mine = coachEmails(coach)
  const allGuests = (event.attendees || []).filter(
    (a: any) => a.email && !mine.includes(a.email.toLowerCase()) && a.responseStatus !== 'declined' && !a.resource
  )
  // Use the first non-coach attendee as the canonical guest (for guestEmail/guestName reporting)
  const guest = allGuests[0] ?? null
  const guestEmail: string | null = guest?.email || null
  const guestName: string | null = guest?.displayName || null

  // Scan ALL attendees for a roster email match (not just the first one — the client
  // may not have accepted but their assistant did, putting them later in the list).
  for (const a of allGuests) {
    const email = a.email.toLowerCase()
    const byEmail = clients.find((c) => c.email && c.email.toLowerCase() === email)
    if (byEmail) return { clientId: byEmail.id, via: 'attendee_email', guestEmail: a.email, guestName: a.displayName || null }
  }

  const roster: RosterClient[] = clients.map((c) => ({ id: c.id, name: c.name }))
  const rawTitle = event.summary as string | undefined
  // Strip "Coaching — Name" prefix that the native scheduler puts on events so
  // "Coaching — Jane Smith" matches the roster entry "Jane Smith" (Jaccard on
  // the full title only reaches 0.67, below the 0.85 confident threshold).
  const cleanedTitle = rawTitle?.replace(/^coaching\s*[—\-–]\s*/i, '').trim() || rawTitle
  for (const [name, via] of [
    [guestName, 'attendee_name' as const],
    [cleanedTitle, 'event_title' as const],
    ...(cleanedTitle !== rawTitle ? [[rawTitle, 'event_title' as const]] as const : []),
  ] as const) {
    if (!name) continue
    const m = matchClient(name, roster)
    if (m.status === 'matched' && m.clientId) return { clientId: m.clientId, via, guestEmail, guestName }
  }

  return { clientId: null, via: 'none', guestEmail, guestName }
}

/**
 * Best-effort, cosmetic guess at where a booking came from, by sniffing the event's
 * text for the provider's fingerprint. Never gates matching — defaults to
 * 'external' when undetermined. (Native bookings are identified by an existing
 * source='native' row, not by this.)
 */
export function detectBookingSource(event: any): 'calendly' | 'hubspot' | 'external' {
  const hay = [
    event.description,
    event.location,
    event.source?.url,
    event.creator?.email,
    event.organizer?.email,
    ...(event.conferenceData?.entryPoints || []).map((p: any) => p?.uri),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  if (hay.includes('calendly')) return 'calendly'
  if (hay.includes('hubspot') || hay.includes('meetings.hubspot')) return 'hubspot'
  return 'external'
}
