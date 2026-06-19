import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'
import { syncAppointmentFromCalendar } from '@/lib/appointments'

export const runtime = 'nodejs'

// The client's upcoming (future, still-scheduled) sessions, soonest first.
// Drives the workspace Sessions card and the compact list on the name card.
//
// Before listing, reconcile each of THIS coach's appointments with its calendar
// event so a session the coach just dragged to a new time (or deleted) shows its
// current time — and the 24h reminder follows. Only the coach who owns the event
// is synced (a shared coach's token can't read it); best-effort so a calendar
// hiccup never blocks the list.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireClientCoach(supabase, params.id)

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
