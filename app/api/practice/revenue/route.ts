import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { listClientMatchedEvents, zonedWallClockToUtc, type RosterClientWithEmail } from '@/lib/calendar'
import { billedHours, sessionRevenue } from '@/lib/billing'

export const runtime = 'nodejs'

type Ymd = { y: number; m: number; d: number }

function ymdInTz(tz: string, at: Date): Ymd {
  const parts: Record<string, string> = {}
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at)) {
    parts[p.type] = p.value
  }
  return { y: +parts.year, m: +parts.month, d: +parts.day }
}

function addDays(ymd: Ymd, n: number): Ymd {
  const dt = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }
}

function ymdStr(ymd: Ymd): string {
  return `${ymd.y}-${String(ymd.m).padStart(2, '0')}-${String(ymd.d).padStart(2, '0')}`
}

/**
 * Practice revenue cards:
 *  - past week (realized): logged session notes dated in the previous calendar
 *    week (Mon–Sun), each valued at its client's session fee.
 *  - this week (projected): calendar events in the current week matched to a
 *    roster client, each valued at that client's fee.
 * Both use the coach's timezone to bound the weeks.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  const tz = coach?.timezone || process.env.DEFAULT_TIMEZONE || 'America/Los_Angeles'

  const today = ymdInTz(tz, new Date())
  const dow = new Date(Date.UTC(today.y, today.m - 1, today.d)).getUTCDay() // 0=Sun..6=Sat
  const backToMonday = (dow + 6) % 7
  const thisMonday = addDays(today, -backToMonday)
  const nextMonday = addDays(thisMonday, 7)
  const lastMonday = addDays(thisMonday, -7)
  // Week before last — for the Past Revenue card's ▲/▼ comparison. Same math,
  // one window earlier (no new revenue calculation).
  const priorMonday = addDays(lastMonday, -7)

  // Per-client fee + name/email lookup.
  const { data: clientRows } = await supabase.from('clients').select('id, name, email, session_fee')
  const feeById = new Map<string, number>()
  const nameById = new Map<string, string>()
  const roster: RosterClientWithEmail[] = []
  for (const c of clientRows || []) {
    feeById.set(c.id, typeof c.session_fee === 'number' ? c.session_fee : 0)
    nameById.set(c.id, c.name)
    roster.push({ id: c.id, name: c.name, email: c.email })
  }

  // --- Past two weeks (realized) from logged notes, by actual logged length ---
  // Pull both weeks in one query, then split by week for the total + comparison.
  const { data: notes } = await supabase
    .from('notes')
    .select('id, client_id, session_date, duration_minutes')
    .gte('session_date', ymdStr(priorMonday))
    .lt('session_date', ymdStr(thisMonday))

  const lastMondayStr = ymdStr(lastMonday)
  let pastTotal = 0
  let pastHours = 0
  let pastSessions = 0
  let priorTotal = 0
  // Per-session breakdown for the expanded card (client · billed amount), last
  // week only, newest first.
  const pastLines: { client: string; minutes: number; amount: number }[] = []
  for (const n of notes || []) {
    const minutes = typeof n.duration_minutes === 'number' ? n.duration_minutes : 60
    const amount = sessionRevenue(feeById.get(n.client_id), minutes)
    if (n.session_date && n.session_date >= lastMondayStr) {
      pastHours += billedHours(minutes)
      pastTotal += amount
      pastSessions++
      pastLines.push({ client: nameById.get(n.client_id) || '—', minutes, amount })
    } else {
      priorTotal += amount
    }
  }

  // --- This week (projected) from the calendar, by scheduled length ---
  let projectedTotal = 0
  let projectedHours = 0
  let projectedSessions = 0
  if (coach?.google_refresh_token) {
    const start = zonedWallClockToUtc(ymdStr(thisMonday), '00:00', tz)
    const end = zonedWallClockToUtc(ymdStr(nextMonday), '00:00', tz)
    if (start && end) {
      const events = await listClientMatchedEvents(coach, start, end, roster)
      for (const e of events) {
        if (!e.clientId) continue
        projectedSessions++
        projectedHours += billedHours(e.durationMinutes)
        projectedTotal += sessionRevenue(feeById.get(e.clientId), e.durationMinutes)
      }
    }
  }

  return NextResponse.json({
    timezone: tz,
    calendarConnected: !!coach?.google_refresh_token,
    past: { weekStart: ymdStr(lastMonday), sessions: pastSessions, hours: pastHours, total: pastTotal },
    prior: { weekStart: ymdStr(priorMonday), total: priorTotal },
    pastSessions: pastLines,
    projected: { weekStart: ymdStr(thisMonday), sessions: projectedSessions, hours: projectedHours, total: projectedTotal },
  })
}
