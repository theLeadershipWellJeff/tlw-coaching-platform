import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { readJson, toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'
import { zonedWallClockToUtc, createClientEvent } from '@/lib/calendar'
import { sendAppointmentReminder } from '@/lib/appointments'
import { normalizeReminderSettings, getMeetingLink } from '@/lib/scheduling'

export const runtime = 'nodejs'

const Schema = z.object({
  // Wall-clock in the coach's timezone — converted to an instant server-side.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A date (YYYY-MM-DD) is required.'),
  time: z.string().regex(/^\d{1,2}:\d{2}$/, 'A time (HH:MM) is required.'),
  durationMinutes: z.number().int().positive().max(480).optional(),
})

/**
 * Book the client's next session. Converts the coach's wall-clock pick to an
 * instant, creates a Google Calendar event (client as guest), records the
 * appointment, and emails the confirmation. Calendar/email are best-effort so a
 * hiccup never loses the booking.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireClientCoach(supabase, params.id)
    const { date, time, durationMinutes } = await readJson(req, Schema)

    const startsAt = zonedWallClockToUtc(date, time, coach.timezone)
    if (!startsAt) return NextResponse.json({ error: 'Could not read that date and time.' }, { status: 400 })
    if (startsAt.getTime() < Date.now() - 60 * 1000) {
      return NextResponse.json({ error: 'That time is in the past.' }, { status: 400 })
    }
    const duration = durationMinutes ?? 60

    const { data: client, error: cErr } = await supabase
      .from('clients')
      .select('id, name, email, timezone')
      .eq('id', params.id)
      .maybeSingle()
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
    if (!client) return NextResponse.json({ error: 'Client not found.' }, { status: 404 })

    const reminderSettings = normalizeReminderSettings(coach.reminder_settings)
    const meetingLink = getMeetingLink(reminderSettings)
    const eventId = await createClientEvent(coach, {
      summary: `Coaching — ${client.name}`,
      startsAt,
      durationMinutes: duration,
      attendeeEmail: client.email,
      location: meetingLink,
      description: `Join the Zoom room:\n${meetingLink}\n\ntheLeadershipWell coaching session.`,
    })

    const { data: appointment, error: insErr } = await supabase
      .from('appointments')
      .insert({
        coach_id: coach.id,
        client_id: client.id,
        scheduled_at: startsAt.toISOString(),
        duration_minutes: duration,
        google_event_id: eventId,
        status: 'scheduled',
        source: 'native',
      })
      .select('*')
      .single()
    if (insErr || !appointment) {
      return NextResponse.json({ error: insErr?.message || 'Could not save the appointment.' }, { status: 500 })
    }

    // Confirmation email — best-effort, and only if the coach has it enabled.
    // The booking stands regardless.
    const wantsConfirmation = reminderSettings.confirmation
    const emailed = wantsConfirmation
      ? await sendAppointmentReminder(supabase, coach, appointment, client, 'confirmation').catch(() => false)
      : false

    return NextResponse.json({ appointment, emailed }, { status: 201 })
  } catch (e) {
    return toErrorResponse(e)
  }
}
