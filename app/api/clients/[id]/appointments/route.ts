import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'
import { syncAppointmentFromCalendar } from '@/lib/appointments'
import { syncExternalBookings } from '@/lib/booking-sync'

export const runtime = 'nodejs'

// The client's upcoming (future, still-scheduled) sessions, soonest first.
// Drives the workspace Sessions card and the compact list on the name card.
//
// Before listing we do two things (both best-effort — a hiccup never blocks):
// 1. Run a calendar delta sync so any NEW bookings (Calendly, HubSpot, or a
//    session the coach added directly in GCal) are captured into `appointments`
//    immediately, without waiting for the hourly cron.
// 2. Reconcile each existing row with its calendar event so a dragged/deleted
//    session shows its current time.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireClientCoach(supabase, params.id)

    // 1. Discover new calendar events (incremental delta — fast when up to date).
    if (coach.google_refresh_token) {
      await syncExternalBookings(supabase, coach).catch(() => {})

      // 1b. Rescue previously-unmatched rows whose attendee_email matches this
      // client's email. This handles the case where the email wasn't on the client
      // record at sync time, or where title-matching fell short (e.g. a new client
      // or an event the cron captured before the roster was complete).
      const { data: clientRow } = await supabase
        .from('clients')
        .select('email')
        .eq('id', params.id)
        .maybeSingle()
      if (clientRow?.email) {
        await supabase
          .from('appointments')
          .update({ client_id: params.id })
          .eq('coach_id', coach.id)
          .is('client_id', null)
          .eq('status', 'scheduled')
          .filter('attendee_email', 'ilike', clientRow.email)
          .catch(() => {})
      }
    }

    // 2. Reconcile existing rows for this client with their calendar events.
    const { data: own } = await supabase
      .from('appointments')
      .select('id, scheduled_at, google_event_id, status')
      .eq('client_id', params.id)
      .eq('coach_id', coach.id)
      .eq('status', 'scheduled')
      .not('google_event_id', 'is', null)
      .gte('scheduled_at', new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString())
    for (const appt of own || []) {
      await syncAppointmentFromCalendar(supabase, coach, appt)
    }

    const { data, error } = await supabase
      .from('appointments')
      .select('id, scheduled_at, duration_minutes, status')
      .eq('client_id', params.id)
      .eq('status', 'scheduled')
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ appointments: data || [] })
  } catch (e) {
    return toErrorResponse(e)
  }
}
