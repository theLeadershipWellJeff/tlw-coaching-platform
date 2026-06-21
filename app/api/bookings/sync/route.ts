import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireCoach, toErrorResponse } from '@/lib/api-handler'
import { syncExternalBookings } from '@/lib/booking-sync'

export const runtime = 'nodejs'

/**
 * Run the external-booking calendar sync for the signed-in coach, on demand. Backs
 * the "Sync bookings now" button on the Unmatched bookings panel so a coach can pull
 * a just-made Calendly/HubSpot booking immediately instead of waiting for the hourly
 * cron. Same orchestrator the cron uses, so behaviour can't drift.
 */
export async function POST() {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)
    const result = await syncExternalBookings(supabase, coach)
    return NextResponse.json({ result })
  } catch (e) {
    return toErrorResponse(e)
  }
}
