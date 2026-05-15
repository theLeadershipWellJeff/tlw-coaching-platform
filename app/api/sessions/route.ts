import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { authOptions } from '@/lib/authOptions'

const CA_URL = 'https://www.coachaccountable.com/API/'
const CA_ID = process.env.COACH_ACCOUNTABLE_API_ID!
const CA_KEY = process.env.COACH_ACCOUNTABLE_API_KEY!

async function caPost(action: string, params: Record<string, string> = {}) {
  const body = new URLSearchParams({ a: action, APIID: CA_ID, APIKey: CA_KEY, ...params })
  const res = await fetch(CA_URL, { method: 'POST', body })
  const json = await res.json()
  if (json.error !== 0) throw new Error(json.message)
  return json.return
}

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

  // Pull CA client roster for name matching
  let caClients: any[] = []
  try {
    caClients = (await caPost('Client.getAll')) || []
  } catch (e) {
    console.error('Failed to fetch CA clients', e)
  }

  const jeffEmails = [
    (process.env.JEFF_FROM_EMAIL || '').toLowerCase(),
    (process.env.JEFF_CC_EMAIL || '').toLowerCase(),
  ]

  function matchClientFromTitle(title: string): { name: string; email: string } | null {
    const t = title.toLowerCase()
    for (const c of caClients) {
      const first = (c.firstName || '').toLowerCase()
      const last = (c.lastName || '').toLowerCase()
      const full = `${first} ${last}`
      if (
        t.includes(full) ||
        t.includes(first) ||
        t.includes(last)
      ) {
        return {
          name: `${c.firstName} ${c.lastName}`.trim(),
          email: c.email || '',
        }
      }
    }
    return null
  }

  function extractNameFromTitle(title: string): string {
    const patterns = [
      /^(.+?)\s+and\s+(?:dr\.?\s*jeff|jeff)/i,
      /^(.+?):\s*\d+\s*min/i,
      /^(.+?)\s*[-:]\s*(?:coaching|session|1:1|tlw)/i,
      /(?:coaching|session|1:1|tlw)\s*[-:]\s*(.+)/i,
    ]
    for (const pattern of patterns) {
      const match = title.match(pattern)
      if (match) return match[1].trim()
    }
    return title
  }

  const sessions = events
    .filter(e => {
      if (!e.summary) return false
      const title = e.summary.toLowerCase()
      const hasAttendees = (e.attendees?.length || 0) > 1

      // Match against CA client names
      const caMatch = matchClientFromTitle(e.summary)
      if (caMatch) return true

      // Match attendees not Jeff
      const nonJeffAttendee = e.attendees?.find(
        a => !jeffEmails.includes((a.email || '').toLowerCase())
      )
      if (nonJeffAttendee) return true

      // Match common coaching keywords
      const isCoaching =
        title.includes('coaching') ||
        title.includes('session') ||
        title.includes('1:1') ||
        title.includes('tlw') ||
        title.includes('dr. jeff') ||
        title.includes('dr jeff')

      return isCoaching
    })
    .map(e => {
      const caMatch = matchClientFromTitle(e.summary || '')
      const nonJeffAttendee = e.attendees?.find(
        a => !jeffEmails.includes((a.email || '').toLowerCase())
      )

      return {
        id: e.id,
        title: e.summary,
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
        clientName: caMatch?.name || nonJeffAttendee?.displayName || extractNameFromTitle(e.summary || ''),
        clientEmail: caMatch?.email || nonJeffAttendee?.email || '',
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
