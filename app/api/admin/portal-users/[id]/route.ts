import { NextRequest, NextResponse } from 'next/server'
import { adminContext, adminErrorResponse } from '@/lib/admin/route'
import { AdminError, listPortalUsers } from '@/lib/admin/debrief'
import { logAdminAction } from '@/lib/admin/audit'
import type { Database, PortalFeatures } from '@/lib/supabase/types'

export const runtime = 'nodejs'

/**
 * Edit a portal user. Body: any of name, email, companyId, cohortId,
 * accessExpiresAt, assessments (boolean — the per-client flag toggle),
 * maxAssessments, maxDocuments. The flag is orthogonal to client_type: this is
 * how a coaching client gets the 360 switched on without re-onboarding.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase, actor } = await adminContext()
    const body = await req.json().catch(() => ({}))
    const { data: client } = await supabase.from('clients').select('id, portal_features').eq('id', params.id).maybeSingle()
    if (!client) throw new AdminError(404, 'Client not found.')
    const patch: Database['public']['Tables']['clients']['Update'] = {}
    if ('name' in body) {
      const name = String(body.name || '').trim()
      if (!name) throw new AdminError(400, 'Name is required.')
      patch.name = name
    }
    if ('email' in body) {
      const email = String(body.email || '').trim().toLowerCase()
      if (!email.includes('@')) throw new AdminError(400, 'A valid email is required.')
      patch.email = email
    }
    if ('companyId' in body) patch.company_id = body.companyId || null
    if ('cohortId' in body) patch.cohort_id = body.cohortId || null
    if ('accessExpiresAt' in body) patch.portal_access_expires_at = body.accessExpiresAt || null
    const features = { ...((client.portal_features as PortalFeatures) || {}) }
    let featuresChanged = false
    if ('assessments' in body) {
      if (typeof body.assessments !== 'boolean') throw new AdminError(400, 'assessments must be true or false.')
      features.assessments = body.assessments
      featuresChanged = true
    }
    for (const [k, col] of [['maxAssessments', 'max_assessments'], ['maxDocuments', 'max_documents']] as const) {
      if (k in body) {
        const n = Number(body[k])
        if (body[k] === null || body[k] === '') delete (features as Record<string, unknown>)[col]
        else if (!Number.isInteger(n) || n < 1) throw new AdminError(400, `${k} must be a positive whole number.`)
        else (features as Record<string, unknown>)[col] = n
        featuresChanged = true
      }
    }
    if (featuresChanged) patch.portal_features = features
    if (!Object.keys(patch).length) throw new AdminError(400, 'Nothing to update.')
    const { error } = await supabase.from('clients').update(patch).eq('id', params.id)
    if (error) throw new AdminError(500, error.message)
    await logAdminAction(supabase, { actorCoachId: actor.id, action: 'portal_user_updated', targetClientId: params.id, detail: { fields: Object.keys(patch), assessments: features.assessments ?? null } })
    const users = await listPortalUsers(supabase)
    return NextResponse.json({ user: users.find((u) => u.id === params.id) || null })
  } catch (e) {
    return adminErrorResponse(e)
  }
}
