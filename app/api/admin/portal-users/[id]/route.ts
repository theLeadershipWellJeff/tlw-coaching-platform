import { NextRequest, NextResponse } from 'next/server'
import { DOCUMENTS_BUCKET } from '@/lib/documents/storage'
import { adminContext, adminErrorResponse } from '@/lib/admin/route'
import { AdminError, listPortalUsers } from '@/lib/admin/debrief'
import { logAdminAction } from '@/lib/admin/audit'
import type { Database, PortalFeatures } from '@/lib/supabase/types'

export const runtime = 'nodejs'

/**
 * One portal user in full for the per-user admin page: the list row, the
 * coach-private key info (this is the COACH side of the wall — it never
 * reaches the portal), every document on file (status + metadata only; a
 * personnel review shows as a row with no content and no actions), and the
 * recent event timeline.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase } = await adminContext()
    const users = await listPortalUsers(supabase)
    const user = users.find((u) => u.id === params.id) || null
    if (!user) throw new AdminError(404, 'Portal user not found.')
    const [{ data: client }, { data: docs }, { data: events }, { data: comms }] = await Promise.all([
      supabase.from('clients').select('key_info, phone, timezone, status, created_at').eq('id', params.id).maybeSingle(),
      supabase
        .from('client_documents')
        .select('id, kind, title, size_bytes, extraction_status, extraction_error, uploader_role, visible_to_coach, assessment_date, instrument, supersedes_document_id, created_at')
        .eq('client_id', params.id)
        .order('created_at', { ascending: false }),
      supabase.from('portal_events').select('event_type, metadata, created_at').eq('client_id', params.id).order('created_at', { ascending: false }).limit(60),
      supabase.from('communications').select('id, type, direction, subject, status, sent_at').eq('client_id', params.id).order('sent_at', { ascending: false }).limit(10),
    ])
    const preferred = await supabase.from('clients').select('preferred_name').eq('id', params.id).maybeSingle().then((r) => r.data?.preferred_name ?? null, () => null)
    return NextResponse.json({
      user,
      keyInfo: client?.key_info ?? null,
      profile: { phone: client?.phone ?? null, timezone: client?.timezone ?? null, preferred_name: preferred, status: client?.status ?? null, created_at: client?.created_at ?? null },
      documents: docs || [],
      events: events || [],
      communications: comms || [],
    })
  } catch (e) {
    return adminErrorResponse(e)
  }
}

/**
 * Edit a portal user. Body: any of name, email, companyId, cohortId,
 * accessExpiresAt, keyInfo, phone, archived (boolean — portal access off,
 * data kept), assessments (boolean — the per-client
 * flag toggle), maxAssessments, maxDocuments. The flag is orthogonal to client_type: this is
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
    // Coach-private reference notes (boss/spouse/context). Never crosses to the portal.
    if ('keyInfo' in body) patch.key_info = body.keyInfo ? String(body.keyInfo).slice(0, 8000) : null
    if ('phone' in body) patch.phone = body.phone ? String(body.phone).trim().slice(0, 40) : null
    const features = { ...((client.portal_features as PortalFeatures) || {}) }
    let featuresChanged = false
    if ('chat' in body) {
      if (typeof body.chat !== 'boolean') throw new AdminError(400, 'chat must be true or false.')
      features.chat = body.chat
      featuresChanged = true
    }
    let archiveAction: 'portal_user_archived' | 'portal_user_restored' | null = null
    if ('archived' in body) {
      if (typeof body.archived !== 'boolean') throw new AdminError(400, 'archived must be true or false.')
      if (body.archived) features.archived = true
      else delete features.archived
      archiveAction = body.archived ? 'portal_user_archived' : 'portal_user_restored'
      featuresChanged = true
    }
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
    await logAdminAction(supabase, { actorCoachId: actor.id, action: archiveAction ?? 'portal_user_updated', targetClientId: params.id, detail: { fields: Object.keys(patch), assessments: features.assessments ?? null } })
    const users = await listPortalUsers(supabase)
    return NextResponse.json({ user: users.find((u) => u.id === params.id) || null })
  } catch (e) {
    return adminErrorResponse(e)
  }
}

/**
 * Permanently delete a portal-only participant (client_type 'portal') and
 * everything they hold: documents (files included), chats, notes, plans,
 * goals, sign-in tokens and the house-coach link. Coaching clients are never
 * deleted here — archive their portal access instead; their record belongs
 * to the coaching roster. Body: { confirmName } must match the stored name.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase, actor } = await adminContext()
    const body = await req.json().catch(() => ({}))
    const { data: client } = await supabase.from('clients').select('id, name, email, client_type, company_id, cohort_id').eq('id', params.id).maybeSingle()
    if (!client) throw new AdminError(404, 'Client not found.')
    if (client.client_type !== 'portal') {
      throw new AdminError(409, 'This is a coaching client. Archive their portal access instead; their coaching record stays in the roster.')
    }
    if (String(body.confirmName || '').trim() !== client.name.trim()) {
      throw new AdminError(400, 'Type the participant\'s full name to confirm.')
    }
    const { count: billed } = await supabase.from('coachees').select('id', { count: 'exact', head: true }).eq('client_id', params.id)
    if ((billed ?? 0) > 0) throw new AdminError(409, 'This participant is on a billing account. Remove them from it first.')

    // Stored files first (the rows cascade with the client; the files would not).
    let filesRemoved = 0
    try {
      const { data: files } = await supabase.storage.from(DOCUMENTS_BUCKET).list(params.id, { limit: 1000 })
      const paths = (files || []).map((f) => `${params.id}/${f.name}`)
      if (paths.length) {
        const { error: rmError } = await supabase.storage.from(DOCUMENTS_BUCKET).remove(paths)
        if (rmError) throw rmError
        filesRemoved = paths.length
      }
    } catch (e) {
      throw new AdminError(502, `Could not remove their stored files, so nothing was deleted. ${e instanceof Error ? e.message : ''}`.trim())
    }

    const { error } = await supabase.from('clients').delete().eq('id', params.id)
    if (error) throw new AdminError(500, error.message)
    await logAdminAction(supabase, {
      actorCoachId: actor.id,
      action: 'portal_user_deleted',
      targetClientId: null,
      detail: { client_id: client.id, name: client.name, email: client.email, company_id: client.company_id, cohort_id: client.cohort_id, files_removed: filesRemoved },
    })
    return NextResponse.json({ deleted: true })
  } catch (e) {
    return adminErrorResponse(e)
  }
}
