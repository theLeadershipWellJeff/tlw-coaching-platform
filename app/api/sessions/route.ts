import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { authOptions } from '@/lib/authOptions'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  auth.setCredentials({ access_token: session.accessToken as string })

  const calendar = google.calendar({ version: 'v3', auth })

  const now = new Date()
  const twoWeeksOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: now.toISOString(),
    timeMax: twoWeeksOut.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 50,
  })

  const events = res.data.items || []

  const jeffEmails = [
    (process.env.JEFF_FROM_EMAIL || '').toLowerCase(),
    (process.env.JEFF_CC_EMAIL || '').toLowerCase(),
  ]

  // The first non-coach guest on an event — the likely client.
  const guestOf = (e: any): any =>
    (e.attendees || []).find((a: any) => a.email && !jeffEmails.includes(a.email.toLowerCase())) ||
    null

  function extractNameFromTitle(title: string): string {
    const patterns = [
      /^(.+?)\s+and\s+(?:dr\.?\s*jeff|jeff)/i,
      /^(.+?):\s*\d+\s*min/i,
      /^(.+?)\s*[-:]\s*(?:coaching|session|1:1|tlw)/i,
      /^(.+?)\s+(?:coaching|session)\b/i,
      /(?:coaching|session|1:1|tlw)\s*[-:]\s*(.+)/i,
    ]
    for (const pattern of patterns) {
      const match = title.match(pattern)
      if (match) return match[1].trim()
    }
    return title
  }

  // Only surface events that look like coaching: either they carry a non-coach
  // guest, or the title is clearly labeled coaching. A bare non-coach attendee
  // alone is not enough — that pulled in CRM/admin meetings and prospects.
  const COACHING_RE = /\b(coaching|session|1:1|tlw)\b|dr\.?\s*jeff/i

  const sessions = events
    .filter((e) => !!e.summary && (!!guestOf(e) || COACHING_RE.test(e.summary)))
    .map((e) => {
      const guest = guestOf(e)
      return {
        id: e.id,
        title: e.summary,
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
        clientName: guest?.displayName || extractNameFromTitle(e.summary || ''),
        clientEmail: guest?.email || '',
        duration: getDuration(e.start?.dateTime ?? undefined, e.end?.dateTime ?? undefined),
        meetLink: e.hangoutLink || e.location || '',
      }
    })

  return NextResponse.json({ sessions })
}

function getDuration(start?: string, end?: string): number {
  if (!start || !end) return 55
  const diff = new Date(end).getTime() - new Date(start).getTime()
  return Math.round(diff / 60000)
}
