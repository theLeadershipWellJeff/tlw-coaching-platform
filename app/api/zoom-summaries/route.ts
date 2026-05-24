// app/api/zoom-summaries/route.ts
// Fetches Zoom AI Companion summaries matched to a specific client.
// Merges signals from CA note dates (passed in) with Google Calendar history.
// GET /api/zoom-summaries?clientName=...&clientEmail=...&sessionTimes=ISO,ISO,ISO

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { authOptions } from '@/lib/authOptions'
import { matchZoomSummariesForClient } from '@/lib/matchZoomToClient'

const CALENDAR_LOOKBACK_DAYS = 90

async function getCalendarSessionTimes(
  accessToken: string,
  clientName: string,
  clientEmail: string,
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
    calendarId: 'primary',
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
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const clientName = (searchParams.get('clientName') || '').trim()
  const clientEmail = (searchParams.get('clientEmail') || '').trim()
  const sessionTimesParam = searchParams.get('sessionTimes') || ''

  const caTimes = sessionTimesParam
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)

  let calendarTimes: string[] = []
  const accessToken = (session as any).accessToken as string | undefined
  if (accessToken && (clientName || clientEmail)) {
    try {
      calendarTimes = await getCalendarSessionTimes(accessToken, clientName, clientEmail)
    } catch (e) {
      console.error('Calendar history fetch failed:', e)
    }
  }

  const allTimes = Array.from(new Set([...caTimes, ...calendarTimes]))

  if (allTimes.length === 0) {
    return NextResponse.json({ matched: 0, summaries: [], signal_sources: { ca: 0, calendar: 0 } })
  }

  try {
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
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Zoom summaries error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
