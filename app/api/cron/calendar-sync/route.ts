import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { syncExternalBookings } from '@/lib/booking-sync'
import type { Coach } from '@/lib/supabase/types'

export const runtime = 'nodejs'

/**
 * External booking capture cron. Vercel Cron hits this hourly. For every coach with
 * a Google refresh token it pulls the calendar delta (incremental events.list via a
 * stored syncToken) and upserts new/changed/cancelled bookings into `appointments`
 * — so a session booked through Calendly or HubSpot (which both write to the coach's
 * Google Calendar) surfaces as the client's Next Appointment without any
 * provider-specific webhook. Idempotent: the (coach_id, google_event_id) upsert key
 * means replaying a delta never duplicates a row.
 *
 * Protected by CRON_SECRET (Vercel passes it as a Bearer token), like the other
 * crons. Refuses to run if the secret isn't configured.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const { data: coaches, error } = await supabase
    .from('coaches')
    .select('*')
    .not('google_refresh_token', 'is', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let discovered = 0
  let updated = 0
  let cancelled = 0
  let unmatched = 0
  for (const coach of coaches || []) {
    try {
      const r = await syncExternalBookings(supabase, coach as Coach)
      discovered += r.discovered
      updated += r.updated
      cancelled += r.cancelled
      unmatched += r.unmatched
    } catch (e) {
      console.error(`[cron/calendar-sync] coach ${(coach as Coach).id} failed:`, e)
    }
  }

  return NextResponse.json({ coaches: coaches?.length || 0, discovered, updated, cancelled, unmatched })
}
