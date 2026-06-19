import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'
import { deleteClientEvent } from '@/lib/calendar'

export const runtime = 'nodejs'

// Cancel an upcoming session: remove the Google Calendar event (notifying the
// guest) and mark the appointment cancelled — kept as a row for history, and
// out of the future list. A pending 24h nudge never fires because the cron only
// scans 'scheduled' rows.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; appointmentId: string } }
) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireClientCoach(supabase, params.id)

    const { data: appointment } = await supabase
      .from('appointments')
      .select('id, google_event_id, status')
      .eq('id', params.appointmentId)
      .eq('client_id', params.id)
      .maybeSingle()
    if (!appointment) return NextResponse.json({ error: 'Appointment not found.' }, { status: 404 })

    if (appointment.google_event_id) {
      await deleteClientEvent(coach, appointment.google_event_id)
    }

    const { error } = await supabase
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', appointment.id)
      .eq('client_id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return toErrorResponse(e)
  }
}
