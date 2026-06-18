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

export interface CoachingEventInput {
  /** The signed-in coach's live Google access token (calendar.events scope). */
  accessToken: string
  summary: string
  description: string
  /** Absolute ISO instants for the event bounds. */
  startISO: string
  endISO: string
  /** IANA zone the event is displayed in (the coach's timezone). */
  timeZone: string
  /** Client to invite; omitted when the client has no email on file. */
  attendeeEmail?: string | null
}

export interface CreatedEvent {
  id: string | null
  htmlLink: string | null
}

/**
 * Create a coaching session on the signed-in coach's primary calendar and email
 * the invite to the client (`sendUpdates: 'all'`). Uses the live session access
 * token — the coach is actively in the UI — so it needs the writable
 * `calendar.events` scope (added at sign-in). Throws on the Google API error so
 * the route can map an insufficient-scope 403 to a "reconnect Google" message.
 */
export async function createCoachingEvent(input: CoachingEventInput): Promise<CreatedEvent> {
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ access_token: input.accessToken })
  const calendar = google.calendar({ version: 'v3', auth })

  const res = await calendar.events.insert({
    calendarId: 'primary',
    sendUpdates: 'all',
    requestBody: {
      summary: input.summary,
      description: input.description,
      start: { dateTime: input.startISO, timeZone: input.timeZone },
      end: { dateTime: input.endISO, timeZone: input.timeZone },
      attendees: input.attendeeEmail ? [{ email: input.attendeeEmail }] : undefined,
    },
  })

  return { id: res.data.id ?? null, htmlLink: res.data.htmlLink ?? null }
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
