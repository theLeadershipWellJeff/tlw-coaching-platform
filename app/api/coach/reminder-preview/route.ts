import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach, coachDisplayName } from '@/lib/coach'
import { formatWhenInTimeZone } from '@/lib/datetime'
import { buildAppointmentEmailHTML } from '@/lib/appointment-email'
import { getMeetingLink, normalizeReminderSettings } from '@/lib/scheduling'

export const runtime = 'nodejs'

/**
 * Preview of a session reminder exactly as a client receives it — the same
 * builder the confirmation and every pre-session nudge go through
 * (`lib/appointments.ts#sendAppointmentReminder`), rendered for a sample
 * client and a sample session. Nothing is sent or stored.
 *
 * Query: kind=confirmation|nudge, hoursBefore=<n> (nudge only, for the
 * subject/sample time), meetingLink=<url> (the link as typed in the settings
 * form, so an unsaved change previews correctly; empty = the saved/default).
 * Returns { subject, html, sample: { clientName, whenLabel } }.
 */
export async function GET(req: NextRequest) {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = req.nextUrl.searchParams
  const kind = params.get('kind') === 'confirmation' ? 'confirmation' : 'nudge'
  const hoursBefore = Math.max(1, Math.min(24 * 14, Number(params.get('hoursBefore')) || 24))

  // The link the email will carry: the form's current value wins (so the coach
  // sees what they typed), else the saved settings / env / firm default —
  // the same resolution the real send uses.
  const saved = normalizeReminderSettings(coach.reminder_settings)
  const typed = (params.get('meetingLink') || '').trim()
  const meetingLink = getMeetingLink(typed ? { ...saved, meetingLink: typed } : saved)

  // Sample session: for a nudge, `hoursBefore` from now (that is when this
  // reminder would fire for it); for a confirmation, one week out at 10:00.
  const tz = coach.timezone || 'America/Los_Angeles'
  const at = new Date()
  if (kind === 'nudge') at.setTime(at.getTime() + hoursBefore * 3_600_000)
  else at.setDate(at.getDate() + 7)
  at.setMinutes(0, 0, 0)
  const whenLabel = formatWhenInTimeZone(at, tz)

  const clientName = 'Sam Client'
  const html = buildAppointmentEmailHTML({
    kind,
    clientName,
    coachName: coachDisplayName(coach),
    whenLabel,
    meetingLink,
  })
  const subject =
    kind === 'confirmation' ? `Our next session — ${whenLabel}` : `Reminder: our session — ${whenLabel}`

  return NextResponse.json({ subject, html, sample: { clientName, whenLabel, timezone: tz } })
}
