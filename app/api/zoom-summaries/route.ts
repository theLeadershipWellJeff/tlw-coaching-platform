// app/api/zoom-summaries/route.ts
// Fetches Zoom AI Companion summaries matched to ONE of the caller's own clients.
// GET /api/zoom-summaries?clientName=...&clientEmail=...&sessionTimes=ISO,ISO
//
// SECURITY (2026-09-09): the Zoom account is firm-wide (server-to-server
// credentials in lib/zoom.ts), so the tenant boundary has to be enforced here.
// The caller must be a coach with a `coaches` row, and the client is resolved
// by email then exact name ONLY within that coach's `accessibleClientIds`. No
// match → no Zoom call and an empty result. Calendar + Zoom matching then run
// on the STORED client name/email, never on the caller-supplied strings.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { authOptions } from '@/lib/authOptions'
import { matchZoomSummariesForClient } from '@/lib/matchZoomToClient'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireCoach, toErrorResponse } from '@/lib/api-handler'
import { accessibleClientIds } from '@/lib/client-access'
import { coachCalendarId } from '@/lib/calendar'

export const runtime = 'nodejs'
// Session + Supabase per request — never statically prerendered.
export const dynamic = 'force-dynamic'

const CALENDAR_LOOKBACK_DAYS = 90

type OwnedClient = { id: string; name: string; email: string | null }

/**
 * Resolve the client the caller is asking about, restricted to their roster.
 * Email first (exact, case-insensitive), then whole-name exact — the same rule
 * as lib/client-lookup, applied inside the `.in('id', ownIds)` boundary.
 */
async function resolveOwnedClient(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  ownIds: string[],
  clientEmail: string,
  clientName: string,
): Promise<OwnedClient | null> {
  if (ownIds.length === 0) return null
  if (clientEmail) {
    const { data } = await supabase
      .from('clients')
      .select('id, name, email')
      .in('id', ownIds)
      .ilike('email', clientEmail)
      .limit(1)
      .maybeSingle()
    if (data) return data as OwnedClient
  }
  if (clientName) {
    const { data } = await supabase
      .from('clients')
      .select('id, name, email')
      .in('id', ownIds)
      .ilike('name', clientName)
      .limit(1)
      .maybeSingle()
    if (data) return data as OwnedClient
  }
  return null
}

async function getCalendarSessionTimes(
  accessToken: string,
  clientName: string,
  clientEmail: string,
  calendarId: string,
): Promise<string[]> {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
  auth.setCredentials({ access_token: accessToken })
  const calendar = google.calendar({ version: 'v3', auth })

  const now = new Date()
  const past = new Date(now.getTime() - CALENDAR_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)

  const res = await calendar.events.list({
    calendarId,
    timeMin: past.toISOString(),
    timeMax: now.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250,
  })

  const events = res.data.items || []
  const emailLower = clientEmail.toLowerCase()
  const nameParts = clientName
    .toLowerCase()
    .split(/\s+/)
    .filter(p => p.length >= 3)

  const matchedTimes: string[] = []
  for (const e of events) {
    const start = e.start?.dateTime
    if (!start) continue

    const attendeeMatch =
      emailLower &&
      e.attendees?.some(a => (a.email || '').toLowerCase() === emailLower)

    const title = (e.summary || '').toLowerCase()
    const titleMatch = nameParts.length > 0 && nameParts.some(p => title.includes(p))

    if (attendeeMatch || titleMatch) {
      matchedTimes.push(start)
    }
  }

  return matchedTimes
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)
    const session = await getServerSession(authOptions)

    const { searchParams } = new URL(req.url)
    const requestedName = (searchParams.get('clientName') || '').trim()
    const requestedEmail = (searchParams.get('clientEmail') || '').trim()
    const sessionTimesParam = searchParams.get('sessionTimes') || ''

    const empty = (reason: string) =>
      NextResponse.json({ matched: 0, summaries: [], signal_sources: { ca: 0, calendar: 0 }, reason })

    // Tenant boundary: only a client on this coach's own roster can be asked about.
    const ownIds = await accessibleClientIds(supabase, coach.id)
    const client = await resolveOwnedClient(supabase, ownIds, requestedEmail, requestedName)
    if (!client) return empty('no_client_match')

    const clientName = client.name
    const clientEmail = client.email || ''

    const caTimes = sessionTimesParam
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)

    let calendarTimes: string[] = []
    const accessToken = (session as any)?.accessToken as string | undefined
    if (accessToken) {
      try {
        // Read the coach's chosen calendar (Account → Calendar); 'primary' default.
        calendarTimes = await getCalendarSessionTimes(accessToken, clientName, clientEmail, coachCalendarId(coach))
      } catch (e) {
        console.error('Calendar history fetch failed:', e)
      }
    }

    const allTimes = Array.from(new Set([...caTimes, ...calendarTimes]))
    if (allTimes.length === 0) return empty('no_session_times')

    const summaries = await matchZoomSummariesForClient(allTimes, 5)

    return NextResponse.json({
      matched: summaries.length,
      signal_sources: { ca: caTimes.length, calendar: calendarTimes.length },
      summaries: summaries.map(s => ({
        meeting_uuid: s.meeting_uuid,
        meeting_start_time: s.meeting_start_time,
        meeting_end_time: s.meeting_end_time,
        summary_title: s.summary_title,
        summary_overview: s.summary_overview,
        summary_details: s.summary_details,
        next_steps: s.next_steps,
      })),
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
