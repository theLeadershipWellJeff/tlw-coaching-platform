import { NextRequest, NextResponse } from 'next/server'
import { adminContext, adminErrorResponse } from '@/lib/admin/route'
import { AdminError } from '@/lib/admin/debrief'
import { logAdminAction } from '@/lib/admin/audit'

export const runtime = 'nodejs'

/** Create a cohort. Body: { companyId, name, seatsPurchased, accessStartsAt?, accessExpiresAt?, debriefCoachName? }. */
export async function POST(req: NextRequest) {
  try {
    const { supabase, actor } = await adminContext()
    const body = await req.json().catch(() => ({}))
    const name = String(body.name || '').trim()
    const companyId = String(body.companyId || '')
    if (!name) throw new AdminError(400, 'Cohort name is required.')
    if (!companyId) throw new AdminError(400, 'A company is required.')
    const seats = Number(body.seatsPurchased ?? 0)
    if (!Number.isInteger(seats) || seats < 0) throw new AdminError(400, 'Seats purchased must be a whole number.')
    const { data, error } = await supabase
      .from('cohorts')
      .insert({
        org_id: actor.org_id,
        company_id: companyId,
        name,
        seats_purchased: seats,
        access_starts_at: body.accessStartsAt || null,
        access_expires_at: body.accessExpiresAt || null,
        debrief_coach_name: body.debriefCoachName ? String(body.debriefCoachName).trim() : null,
      } as any)
      .select('*')
      .single()
    if (error || !data) throw new AdminError(500, error?.message || 'Could not create the cohort.')
    await logAdminAction(supabase, { actorCoachId: actor.id, action: 'cohort_created', detail: { cohort_id: data.id, company_id: companyId, name, seats } })
    return NextResponse.json({ cohort: { ...data, seats_activated: 0 } }, { status: 201 })
  } catch (e) {
    return adminErrorResponse(e)
  }
}
