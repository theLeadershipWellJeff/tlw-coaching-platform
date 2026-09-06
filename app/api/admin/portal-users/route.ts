import { NextRequest, NextResponse } from 'next/server'
import { adminContext, adminErrorResponse } from '@/lib/admin/route'
import { createPortalParticipant, listPortalUsers, type PortalUserKind } from '@/lib/admin/debrief'
import { logAdminAction } from '@/lib/admin/audit'

export const runtime = 'nodejs'

/** Portal users (standalone participants + coaching clients with the flag on). ?cohortId= / ?companyId= */
export async function GET(req: NextRequest) {
  try {
    const { supabase } = await adminContext()
    const cohortId = req.nextUrl.searchParams.get('cohortId') || undefined
    const companyId = req.nextUrl.searchParams.get('companyId') || undefined
    const kind = (req.nextUrl.searchParams.get('kind') || undefined) as PortalUserKind | undefined
    const users = await listPortalUsers(supabase, { cohortId, companyId, kind })
    return NextResponse.json({ users })
  } catch (e) {
    return adminErrorResponse(e)
  }
}

/** Create a standalone participant. Body: { name, email, companyId?, cohortId?, enableAssessments? }. */
export async function POST(req: NextRequest) {
  try {
    const { supabase, actor } = await adminContext()
    const body = await req.json().catch(() => ({}))
    const { id } = await createPortalParticipant(supabase, actor, {
      name: String(body.name || ''),
      email: String(body.email || ''),
      companyId: body.companyId || null,
      cohortId: body.cohortId || null,
      enableAssessments: body.enableAssessments !== false,
    })
    await logAdminAction(supabase, { actorCoachId: actor.id, action: 'portal_user_created', targetClientId: id, detail: { cohort_id: body.cohortId || null } })
    const users = await listPortalUsers(supabase)
    return NextResponse.json({ id, user: users.find((u) => u.id === id) || null }, { status: 201 })
  } catch (e) {
    return adminErrorResponse(e)
  }
}
