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

export type ReminderKind = 'confirmation' | 'nudge_24h'

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
  const html = buildAppointmentEmailHTML({
    kind: kind === 'confirmation' ? 'confirmation' : 'nudge',
    clientName: client.name,
    coachName: coach.name,
    whenLabel,
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
