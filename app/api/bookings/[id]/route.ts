import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { readJson, requireCoach, toErrorResponse } from '@/lib/api-handler'
import { coachCanAccessClient } from '@/lib/client-access'

export const runtime = 'nodejs'

const Schema = z
  .object({
    // Assign the booking to a roster client (it then surfaces as their Next
    // Appointment), or dismiss it (terminal 'ignored' — never resurfaces on sync).
    clientId: z.string().uuid().optional(),
    action: z.literal('dismiss').optional(),
  })
  .refine((v) => !!v.clientId || v.action === 'dismiss', {
    message: 'Provide a clientId to assign, or action: "dismiss".',
  })

/**
 * Resolve one unmatched booking. Coach-scoped to the booking's own coach; assigning
 * also checks the coach can access the target client. Assigning sets client_id (no
 * calendar write — the event already exists); dismissing marks it 'ignored'.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)
    const { clientId, action } = await readJson(req, Schema)

    const { data: booking } = await supabase
      .from('appointments')
      .select('id, coach_id')
      .eq('id', params.id)
      .eq('coach_id', coach.id)
      .maybeSingle()
    if (!booking) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })

    if (action === 'dismiss') {
      const { error } = await supabase.from('appointments').update({ status: 'ignored' }).eq('id', booking.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // Assign: the coach must be linked to the client they're assigning it to.
    if (!(await coachCanAccessClient(supabase, coach.id, clientId!))) {
      return NextResponse.json({ error: 'Client not found.' }, { status: 404 })
    }
    const { error } = await supabase
      .from('appointments')
      .update({ client_id: clientId })
      .eq('id', booking.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return toErrorResponse(e)
  }
}
