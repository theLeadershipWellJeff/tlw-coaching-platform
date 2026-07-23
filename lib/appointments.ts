/**
 * Reminder send + log for scheduled sessions. One place so the booking
 * confirmation and the cron's 24h nudge behave identically and stay idempotent.
 *
 * Idempotency: we CLAIM the (appointment, kind) slot by inserting the log row
 * first — the unique index means a second attempt fails, so a reminder can never
 * fire twice. If the email then fails to send we roll the claim back so the next
 * cron run retries.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Appointment, Coach, Database } from './supabase/types'
import { formatWhenInTimeZone } from './datetime'
import { buildAppointmentEmailHTML } from './appointment-email'
import { sendCoachHtmlEmail } from './gmail'
import { getClientEventState } from './calendar'
import { normalizeReminderSettings, getMeetingLink } from './scheduling'

// 'confirmation' = the booking email; any other value is a pre-session nudge
// slot name (e.g. 'nudge_24h', 'nudge_1h' — see lib/scheduling.ts#reminderKind).
export type ReminderKind = string

// A reschedule of more than this re-arms the 24h nudge, so a meaningful move in
// Google Calendar sends a fresh reminder for the new time. Smaller drags just
// update the stored time without re-emailing (avoids spamming on a 10-min tweak).
const NUDGE_REARM_MS = 60 * 60 * 1000

/**
 * Reconcile one appointment with its Google Calendar event so the stored time —
 * and the reminder — tracks what the coach does in their calendar:
 *  - event deleted  → cancel the appointment (drops from the list; no nudge),
 *  - event moved    → update scheduled_at/duration; if moved materially, clear
 *                     the 24h nudge so it re-fires for the new time.
 * Pass the appointment's OWNING coach (whose calendar holds the event) — calling
 * with a different coach's token would 404 and wrongly cancel.
 */
export async function syncAppointmentFromCalendar(
  supabase: SupabaseClient<Database>,
  coach: Coach,
  appt: Pick<Appointment, 'id' | 'scheduled_at' | 'google_event_id' | 'status'>
): Promise<void> {
  if (appt.status !== 'scheduled' || !appt.google_event_id) return

  const state = await getClientEventState(coach, appt.google_event_id)
  if (!state.found || state.cancelled) {
    await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', appt.id)
    return
  }
  if (!state.startsAt) return // couldn't read a time — leave the row untouched

  const drift = Math.abs(state.startsAt.getTime() - new Date(appt.scheduled_at).getTime())
  if (drift < 60 * 1000) return // within a minute: treat as unchanged

  const update: { scheduled_at: string; duration_minutes?: number } = {
    scheduled_at: state.startsAt.toISOString(),
  }
  if (state.durationMinutes) update.duration_minutes = state.durationMinutes
  await supabase.from('appointments').update(update).eq('id', appt.id)

  if (drift >= NUDGE_REARM_MS) {
    // Clear every nudge slot (not just 24h) so all of the coach's configured
    // reminders re-fire relative to the new time.
    await supabase
      .from('appointment_reminders')
      .delete()
      .eq('appointment_id', appt.id)
      .like('kind', 'nudge_%')
  }
}

type ClientLite = { name: string; email: string | null; timezone: string | null }

export async function sendAppointmentReminder(
  supabase: SupabaseClient<Database>,
  coach: Coach,
  appointment: Pick<Appointment, 'id' | 'scheduled_at'>,
  client: ClientLite,
  kind: ReminderKind
): Promise<boolean> {
  if (!client.email) return false

  // Claim the slot. A conflict (or any insert error) means "don't send" — most
  // often because it's already been sent. Cheaper than racing the send.
  const { error: claimErr } = await supabase
    .from('appointment_reminders')
    .insert({ appointment_id: appointment.id, kind, sent_at: new Date().toISOString() })
  if (claimErr) return false

  const tz = client.timezone || coach.timezone
  const whenLabel = formatWhenInTimeZone(new Date(appointment.scheduled_at), tz)
  const meetingLink = getMeetingLink(normalizeReminderSettings(coach.reminder_settings))
  const html = buildAppointmentEmailHTML({
    kind: kind === 'confirmation' ? 'confirmation' : 'nudge',
    clientName: client.name,
    coachName: coach.name,
    whenLabel,
    meetingLink,
  })
  const subject =
    kind === 'confirmation' ? `Our next session — ${whenLabel}` : `Reminder: our session — ${whenLabel}`
  // Cc the coach on the confirmation (a copy for their records); the nudge is
  // just for the client.
  const cc = kind === 'confirmation' ? process.env.JEFF_CC_EMAIL || undefined : undefined

  const ok = await sendCoachHtmlEmail(coach, { to: client.email, cc, subject, html }).catch(() => false)
  if (!ok) {
    await supabase
      .from('appointment_reminders')
      .delete()
      .eq('appointment_id', appointment.id)
      .eq('kind', kind)
  }
  return ok
}
