import { NextRequest, NextResponse } from 'next/server'
import { adminContext, adminErrorResponse } from '@/lib/admin/route'
import { AdminError } from '@/lib/admin/debrief'
import { listAssignableCoaches } from '@/lib/admin/coach-assignment'
import { logAdminAction } from '@/lib/admin/audit'
import { schedulingUpdateFromBody } from '@/lib/coach-scheduling'

export const runtime = 'nodejs'

/**
 * Set a coach's client-facing scheduling contact on their behalf.
 * Body: any of bookingUrl, assistantName, assistantEmail ("" clears).
 * The same fields the coach can set in Account → Scheduling.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase, actor } = await adminContext()
    const body = await req.json().catch(() => ({}))
    const parsed = schedulingUpdateFromBody(body)
    if (!parsed.ok) throw new AdminError(400, parsed.error)
    const { booking_url, ...assistant } = parsed.value
    if (booking_url === undefined && !Object.keys(assistant).length) throw new AdminError(400, 'Nothing to update.')

    const { data: coach } = await supabase.from('coaches').select('id').eq('id', params.id).maybeSingle()
    if (!coach) throw new AdminError(404, 'Coach not found.')

    if (booking_url !== undefined) {
      const { error } = await supabase.from('coaches').update({ booking_url }).eq('id', params.id)
      if (error) throw new AdminError(500, error.message)
    }
    if (Object.keys(assistant).length) {
      const { error } = await supabase.from('coaches').update(assistant as any).eq('id', params.id)
      if (error) throw new AdminError(500, `Could not save the scheduling assistant — apply migration 074. (${error.message})`)
    }
    await logAdminAction(supabase, {
      actorCoachId: actor.id,
      action: 'coach_scheduling_updated',
      targetCoachId: params.id,
      detail: { fields: Object.keys(parsed.value) },
    })
    const { coaches } = await listAssignableCoaches(supabase)
    return NextResponse.json({ coach: coaches.find((c) => c.id === params.id) || null })
  } catch (e) {
    return adminErrorResponse(e)
  }
}
