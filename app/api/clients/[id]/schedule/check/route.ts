import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { readJson, toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'
import { zonedWallClockToUtc, getCalendarConflicts } from '@/lib/calendar'
import { formatWhenInTimeZone } from '@/lib/datetime'
import {
  normalizeAvailability,
  isWithinAvailability,
  WEEKDAY_LABELS,
} from '@/lib/scheduling'

export const runtime = 'nodejs'

const Schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A date (YYYY-MM-DD) is required.'),
  time: z.string().regex(/^\d{1,2}:\d{2}$/, 'A time (HH:MM) is required.'),
  durationMinutes: z.number().int().positive().max(480).optional(),
})

/**
 * Live pre-flight for the workspace scheduler. Given the coach's wall-clock pick
 * it reports, in one round-trip: the instant rendered in both the coach's and the
 * client's timezone (so the two can agree on the call), whether the coach's
 * Google Calendar is free then (drives the blue/grey Schedule button), and
 * whether the slot is inside the coach's set availability (a soft warning).
 * Read-only — it never books anything.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireClientCoach(supabase, params.id)
    const { date, time, durationMinutes } = await readJson(req, Schema)

    const startsAt = zonedWallClockToUtc(date, time, coach.timezone)
    if (!startsAt) return NextResponse.json({ error: 'Could not read that date and time.' }, { status: 400 })
    const duration = durationMinutes ?? 60
    const endsAt = new Date(startsAt.getTime() + duration * 60 * 1000)
    const past = startsAt.getTime() < Date.now() - 60 * 1000

    const { data: client } = await supabase
      .from('clients')
      .select('timezone')
      .eq('id', params.id)
      .maybeSingle()
    const clientTimezone = client?.timezone || null

    // Free/busy on the coach's calendar (best-effort).
    const conflict = await getCalendarConflicts(coach, startsAt, endsAt)

    // Soft availability check (warn, don't block).
    const availability = normalizeAvailability(coach.availability)
    const within = isWithinAvailability(startsAt, duration, availability, coach.timezone)
    const day = new Intl.DateTimeFormat('en-US', { timeZone: coach.timezone, weekday: 'long' }).format(startsAt)
    const dayIdx = WEEKDAY_LABELS.indexOf(day as (typeof WEEKDAY_LABELS)[number])
    const win = dayIdx >= 0 ? availability[String(dayIdx)] : undefined
    const availabilityLabel =
      win && win.enabled ? `${day} ${win.start}–${win.end}` : `${day} (no hours set)`

    return NextResponse.json({
      startsAt: startsAt.toISOString(),
      past,
      coachTimezone: coach.timezone,
      coachTimeLabel: formatWhenInTimeZone(startsAt, coach.timezone),
      clientTimezone,
      clientTimeLabel: clientTimezone ? formatWhenInTimeZone(startsAt, clientTimezone) : null,
      conflictChecked: conflict.checked,
      conflict: conflict.busy,
      withinAvailability: within,
      availabilityLabel,
    })
  } catch (e) {
    return toErrorResponse(e)
  }
}
