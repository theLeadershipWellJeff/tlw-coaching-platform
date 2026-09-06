import { NextRequest, NextResponse } from 'next/server'
import { adminContext, adminErrorResponse } from '@/lib/admin/route'
import { AdminError, seatsActivated } from '@/lib/admin/debrief'
import { logAdminAction } from '@/lib/admin/audit'
import type { Database } from '@/lib/supabase/types'

export const runtime = 'nodejs'

/** Edit a cohort. Body: any of name, seatsPurchased, accessStartsAt, accessExpiresAt, debriefCoachName, status. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase, actor } = await adminContext()
    const body = await req.json().catch(() => ({}))
    const patch: Database['public']['Tables']['cohorts']['Update'] = { updated_at: new Date().toISOString() }
    if ('name' in body) {
      const name = String(body.name || '').trim()
      if (!name) throw new AdminError(400, 'Cohort name is required.')
      patch.name = name
    }
    if ('seatsPurchased' in body) {
      const seats = Number(body.seatsPurchased)
      if (!Number.isInteger(seats) || seats < 0) throw new AdminError(400, 'Seats purchased must be a whole number.')
      patch.seats_purchased = seats
    }
    if ('accessStartsAt' in body) patch.access_starts_at = body.accessStartsAt || null
    if ('accessExpiresAt' in body) patch.access_expires_at = body.accessExpiresAt || null
    if ('debriefCoachName' in body) patch.debrief_coach_name = body.debriefCoachName ? String(body.debriefCoachName).trim() : null
    if ('status' in body) {
      // Lifecycle: active (running) → inactive (finished, reference) → archived
      // (out of the working lists). 'closed' is the pre-cohorts-tab spelling.
      const status = body.status === 'closed' ? 'inactive' : body.status
      if (!['active', 'inactive', 'archived'].includes(status as string)) throw new AdminError(400, 'Status must be active, inactive, or archived.')
      patch.status = status
    }
    const { data, error } = await supabase.from('cohorts').update(patch).eq('id', params.id).select('*').maybeSingle()
    if (error) throw new AdminError(500, error.message)
    if (!data) throw new AdminError(404, 'Cohort not found.')
    const activated = await seatsActivated(supabase, [params.id])
    await logAdminAction(supabase, { actorCoachId: actor.id, action: 'cohort_updated', detail: { cohort_id: params.id, fields: Object.keys(patch) } })
    return NextResponse.json({ cohort: { ...data, seats_activated: activated[params.id] || 0 } })
  } catch (e) {
    return adminErrorResponse(e)
  }
}
