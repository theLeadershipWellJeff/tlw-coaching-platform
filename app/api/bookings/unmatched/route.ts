import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireCoach, toErrorResponse } from '@/lib/api-handler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The coach's unmatched bookings review queue: calendar bookings we captured
 * (typically from Calendly/HubSpot) but couldn't tie to a roster client — kept as
 * client_id-null, status='scheduled' rows so nothing is silently dropped. Future
 * sessions only; soonest first. The coach assigns each to a client or dismisses it
 * (PATCH /api/bookings/[id]).
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)

    const { data, error } = await supabase
      .from('appointments')
      .select('id, scheduled_at, duration_minutes, title, attendee_email, source')
      .eq('coach_id', coach.id)
      .is('client_id', null)
      .eq('status', 'scheduled')
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ bookings: data || [] })
  } catch (e) {
    return toErrorResponse(e)
  }
}
