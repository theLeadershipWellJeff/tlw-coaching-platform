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

/** Split [start, endExclusive) into per-calendar-month windows (≤12). Keeps each
 *  calendar fetch well under the 250-event page size for the annual projection. */
function monthlyChunks(start: Ymd, endExclusive: Ymd): { start: Ymd; end: Ymd }[] {
  const out: { start: Ymd; end: Ymd }[] = []
  let cur = start
  while (ymdStr(cur) < ymdStr(endExclusive)) {
    const firstOfNext: Ymd = cur.m === 12 ? { y: cur.y + 1, m: 1, d: 1 } : { y: cur.y, m: cur.m + 1, d: 1 }
    const end = ymdStr(firstOfNext) < ymdStr(endExclusive) ? firstOfNext : endExclusive
    out.push({ start: cur, end })
    cur = firstOfNext
  }
  return out
}

/**
 * Practice revenue cards + dashboard revenue legos:
 *  - past week (realized): logged session notes dated in the previous calendar
 *    week (Mon–Sun), each valued at its client's session fee (+ a prior-week
 *    total for ▲/▼ and a per-session breakdown).
 *  - this week (projected): calendar events in the current week matched to a
 *    roster client, each valued at that client's fee.
 *  - annual (§8.2): full-year = actuals YTD (logged notes before this week) +
 *    projected remainder (this week → year-end, from the calendar), with a
 *    monthly actual/projected split for the trend chart.
 * Every figure reuses billedHours/sessionRevenue (no new revenue math); the
 * coach's timezone bounds every window.
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

  // Year bounds (coach tz) for the Annual card.
  const yearStartYmd: Ymd = { y: today.y, m: 1, d: 1 }
  const yearEndYmd: Ymd = { y: today.y + 1, m: 1, d: 1 }
  const yearStartStr = ymdStr(yearStartYmd)
  const lastMondayStr = ymdStr(lastMonday)
  const priorMondayStr = ymdStr(priorMonday)

  // --- Realized (logged notes), by actual logged length ---
  // One query covers YTD plus the two comparison weeks (which in early January
  // can predate Jan 1). We split it into windows below; all valuation reuses
  // sessionRevenue/billedHours.
  const notesStart = priorMondayStr < yearStartStr ? priorMondayStr : yearStartStr
  const { data: notes } = await supabase
    .from('notes')
    .select('id, client_id, session_date, duration_minutes')
    .gte('session_date', notesStart)
    .lt('session_date', ymdStr(thisMonday))

  let pastTotal = 0
  let pastHours = 0
  let pastSessions = 0
  let priorTotal = 0
  let actualsYtd = 0
  const monthlyActual = new Array(13).fill(0) // index 1..12
  // Per-session breakdown for the expanded Past card (client · billed amount),
  // last week only, newest first.
  const pastLines: { client: string; minutes: number; amount: number }[] = []
  for (const n of notes || []) {
    const sd = n.session_date || ''
    const minutes = typeof n.duration_minutes === 'number' ? n.duration_minutes : 60
    const amount = sessionRevenue(feeById.get(n.client_id), minutes)
    if (sd >= lastMondayStr) {
      pastHours += billedHours(minutes)
      pastTotal += amount
      pastSessions++
      pastLines.push({ client: nameById.get(n.client_id) || '—', minutes, amount })
    } else if (sd >= priorMondayStr) {
      priorTotal += amount
    }
    if (sd >= yearStartStr) {
      actualsYtd += amount
      monthlyActual[+sd.slice(5, 7)] += amount
    }
  }

  // --- Projected (calendar), this week + the rest of the year ---
  // Chunk the forward window by month so each calendar fetch stays well under the
  // 250-event page size, then reuse the existing event matcher per chunk.
  let projectedTotal = 0
  let projectedHours = 0
  let projectedSessions = 0
  let projectedRemainder = 0
  const monthlyProjected = new Array(13).fill(0) // index 1..12
  if (coach?.google_refresh_token) {
    const nextMondayMs = zonedWallClockToUtc(ymdStr(nextMonday), '00:00', tz)?.getTime() ?? Infinity
    for (const ch of monthlyChunks(thisMonday, yearEndYmd)) {
      const s = zonedWallClockToUtc(ymdStr(ch.start), '00:00', tz)
      const e = zonedWallClockToUtc(ymdStr(ch.end), '00:00', tz)
      if (!s || !e) continue
      const events = await listClientMatchedEvents(coach, s, e, roster)
      for (const ev of events) {
        if (!ev.clientId) continue
        const amount = sessionRevenue(feeById.get(ev.clientId), ev.durationMinutes)
        projectedRemainder += amount
        monthlyProjected[ch.start.m] += amount // chunk is within one calendar month
        // The current week is the existing "this week projected" figure.
        const evMs = ev.start ? Date.parse(ev.start) : NaN
        if (Number.isFinite(evMs) && evMs < nextMondayMs) {
          projectedSessions++
          projectedHours += billedHours(ev.durationMinutes)
          projectedTotal += amount
        }
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
    annual: {
      year: today.y,
      actualsYtd,
      projectedRemainder,
      total: actualsYtd + projectedRemainder,
      monthly: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        actual: monthlyActual[i + 1],
        projected: monthlyProjected[i + 1],
      })),
    },
  })
}
