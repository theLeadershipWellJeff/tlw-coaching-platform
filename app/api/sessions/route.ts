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

  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  // Non-Jeff guests on an event.
  const guestsOf = (e: any): any[] =>
    (e.attendees || []).filter((a: any) => a.email && !jeffEmails.includes(a.email.toLowerCase()))

  // Reliable signal: an exact match between a guest's email and a client email.
  function clientByEmail(email: string) {
    const e = email.toLowerCase()
    return caClients.find((c) => (c.email || '').toLowerCase() === e) || null
  }

  // Match a client ONLY when both first and last name (each >= 2 chars) appear
  // as whole words in the title. Never match on a lone short fragment — a
  // one-letter last name like "W" would otherwise hit any title containing a "w".
  function clientByFullName(title: string) {
    const t = title.toLowerCase()
    for (const c of caClients) {
      const first = (c.firstName || '').trim().toLowerCase()
      const last = (c.lastName || '').trim().toLowerCase()
      if (first.length < 2 || last.length < 2) continue
      if (new RegExp(`\\b${esc(first)}\\b`).test(t) && new RegExp(`\\b${esc(last)}\\b`).test(t)) return c
    }
    return null
  }

  const clientFullName = (c: any) => `${c.firstName || ''} ${c.lastName || ''}`.trim()

  // Identify the client for an event: guest email first, then a full-name match.
  function matchClient(e: any): { name: string; email: string } | null {
    for (const g of guestsOf(e)) {
      const c = clientByEmail(g.email)
      if (c) return { name: clientFullName(c), email: c.email || g.email }
    }
    const byName = clientByFullName(e.summary || '')
    return byName ? { name: clientFullName(byName), email: byName.email || '' } : null
  }

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

  // Only surface confirmed client sessions, or events clearly labeled coaching.
  // A bare non-Jeff attendee is no longer enough — that pulled in CRM/admin
  // meetings and prospects and mislabeled them as clients.
  const COACHING_RE = /\b(coaching|session|1:1|tlw)\b|dr\.?\s*jeff/i

  const sessions = events
    .filter((e) => !!e.summary && (!!matchClient(e) || COACHING_RE.test(e.summary)))
    .map((e) => {
      const client = matchClient(e)
      const guest = guestsOf(e)[0]
      return {
        id: e.id,
        title: e.summary,
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
        clientName: client?.name || extractNameFromTitle(e.summary || ''),
        clientEmail: client?.email || guest?.email || '',
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
