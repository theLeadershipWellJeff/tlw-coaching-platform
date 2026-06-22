import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { listCalendarEvents, zonedWallClockToUtc } from '@/lib/calendar'
import { todayInTimeZone, ymdInTimeZone } from '@/lib/datetime'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Add `n` days to a YYYY-MM-DD string (UTC-safe; no timezone math needed). */
function addDayStr(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

interface DayLoad {
  hours: number
  sessions: { title: string; start: string; durationMinutes: number }[]
}

/**
 * Calendar heat-map data — booked hours per day from the coach's Google Calendar
 * (live). Covers the current month (the month grid) plus the next 7 days (the
 * compact strip). Read-only; bucketing/coloring happen client-side.
 */
export async function GET() {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tz = coach.timezone || process.env.DEFAULT_TIMEZONE || 'America/Los_Angeles'
  const today = todayInTimeZone(tz)
  const [y, m] = today.split('-').map(Number)
  const monthStart = `${y}-${String(m).padStart(2, '0')}-01`
  const nextMonthStart = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  // Window must also cover the compact strip (today + 6 more days), which can run
  // past month-end.
  const stripEnd = addDayStr(today, 7)
  const windowEnd = stripEnd > nextMonthStart ? stripEnd : nextMonthStart

  // Pre-seed every day in the window at zero so empty days still render.
  const days: Record<string, DayLoad> = {}
  for (let d = monthStart; d < windowEnd; d = addDayStr(d, 1)) {
    days[d] = { hours: 0, sessions: [] }
  }

  let calendarConnected = false
  if (coach.google_refresh_token) {
    const timeMin = zonedWallClockToUtc(monthStart, '00:00', tz)
    const timeMax = zonedWallClockToUtc(windowEnd, '00:00', tz)
    if (timeMin && timeMax) {
      calendarConnected = true
      const events = await listCalendarEvents(coach, timeMin, timeMax)
      for (const ev of events) {
        if (!ev.start) continue
        const day = ymdInTimeZone(new Date(ev.start), tz)
        const bucket = days[day]
        if (!bucket) continue // outside the seeded window
        bucket.hours += ev.durationMinutes / 60
        bucket.sessions.push({ title: ev.title, start: ev.start, durationMinutes: ev.durationMinutes })
      }
      // Round to one decimal to avoid float noise in labels.
      for (const k of Object.keys(days)) days[k].hours = Math.round(days[k].hours * 10) / 10
    }
  }

  return NextResponse.json({ timezone: tz, calendarConnected, today, year: y, month: m, days })
}
