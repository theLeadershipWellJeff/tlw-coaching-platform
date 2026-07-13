import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { readJson, toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'
import { zonedWallClockToUtc, createClientEvent } from '@/lib/calendar'
import { sendAppointmentReminder } from '@/lib/appointments'
import { normalizeReminderSettings } from '@/lib/scheduling'

export const runtime = 'nodejs'

const Schema = z.object({
  // Wall-clock in the coach's timezone — converted to an instant server-side.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A date (YYYY-MM-DD) is required.'),
  time: z.string().regex(/^\d{1,2}:\d{2}$/, 'A time (HH:MM) is required.'),
  durationMinutes: z.number().int().positive().max(480).optional(),
  // Zoom (or other) join link — goes into the calendar invite + reminder emails.
  meetingLink: z.string().trim().max(500).optional(),
})

/**
 * GET — the meeting link to prefill the schedule form with: the last link used
 * for this client, else the coach's most recently used link anywhere, else the
 * Zoom link off the most recently issued agreement (the same "your standard link
 * is whatever you sent last" pattern the agreement issue modal uses).
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireClientCoach(supabase, params.id)

    const { data: recent } = await supabase
      .from('appointments')
      .select('client_id, meeting_link')
      .eq('coach_id', coach.id)
      .not('meeting_link', 'is', null)
      .order('created_at', { ascending: false })
      .limit(25)
    let link =
      recent?.find((a) => a.client_id === params.id)?.meeting_link ||
      recent?.[0]?.meeting_link ||
      null

    if (!link) {
      const { data: agreements } = await supabase
        .from('agreements')
        .select('zoom_link')
        .eq('coach_id', coach.id)
        .order('created_at', { ascending: false })
        .limit(25)
      link = agreements?.find((a) => a.zoom_link)?.zoom_link || null
    }

    return NextResponse.json({ defaultMeetingLink: link })
  } catch (e) {
    return toErrorResponse(e)
  }
}

/**
 * Book the client's next session. Converts the coach's wall-clock pick to an
 * instant, creates a Google Calendar event (client as guest, meeting link in the
 * invite), records the appointment, and emails the confirmation. Calendar/email
 * are best-effort so a hiccup never loses the booking.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireClientCoach(supabase, params.id)
    const { date, time, durationMinutes, meetingLink: rawLink } = await readJson(req, Schema)

    const startsAt = zonedWallClockToUtc(date, time, coach.timezone)
    if (!startsAt) return NextResponse.json({ error: 'Could not read that date and time.' }, { status: 400 })
    if (startsAt.getTime() < Date.now() - 60 * 1000) {
      return NextResponse.json({ error: 'That time is in the past.' }, { status: 400 })
    }
    const duration = durationMinutes ?? 60
    const meetingLink = rawLink?.trim() || null
    if (meetingLink && !/^https?:\/\//i.test(meetingLink)) {
      return NextResponse.json(
        { error: 'The meeting link must be a full URL (starting with https://).' },
        { status: 400 }
      )
    }

    const { data: client, error: cErr } = await supabase
      .from('clients')
      .select('id, name, email, timezone')
      .eq('id', params.id)
      .maybeSingle()
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
    if (!client) return NextResponse.json({ error: 'Client not found.' }, { status: 404 })

    const eventId = await createClientEvent(coach, {
      summary: `Coaching — ${client.name}`,
      startsAt,
      durationMinutes: duration,
      attendeeEmail: client.email,
      description: 'theLeadershipWell coaching session.',
      meetingLink,
    })

    const { data: appointment, error: insErr } = await supabase
      .from('appointments')
      .insert({
        coach_id: coach.id,
        client_id: client.id,
        scheduled_at: startsAt.toISOString(),
        duration_minutes: duration,
        google_event_id: eventId,
        meeting_link: meetingLink,
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
    const wantsConfirmation = normalizeReminderSettings(coach.reminder_settings).confirmation
    const emailed = wantsConfirmation
      ? await sendAppointmentReminder(supabase, coach, appointment, client, 'confirmation').catch(() => false)
      : false

    return NextResponse.json({ appointment, emailed }, { status: 201 })
  } catch (e) {
    return toErrorResponse(e)
  }
}
