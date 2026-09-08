import { NextRequest, NextResponse } from 'next/server'
import { adminContext, adminErrorResponse } from '@/lib/admin/route'
import { AdminError } from '@/lib/admin/debrief'
import { logAdminAction } from '@/lib/admin/audit'
import { createClientDocument, DocumentError, MAX_DOCUMENT_BYTES } from '@/lib/documents/pipeline'
import type { ClientDocumentKind, PortalFeatures } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const maxDuration = 120

const KINDS: ClientDocumentKind[] = ['assessment_360', 'general', 'company_doc']

/**
 * Upload ONE document for ONE portal user from the command center (the
 * per-user page, or the add-participant forms right after creation).
 * Multipart: file, kind (assessment_360 | general), title?, confirmName?
 * ("1" accepts a name mismatch a human has checked). A completed 360 flips
 * the client's assessments flag on — the upload IS the switch. Personnel
 * reviews are never uploaded on someone's behalf.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase, actor } = await adminContext()
    const { data: client } = await supabase.from('clients').select('id, org_id, name, portal_features').eq('id', params.id).maybeSingle()
    if (!client) throw new AdminError(404, 'Client not found.')
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) throw new AdminError(400, 'Choose a file.')
    if (file.size > MAX_DOCUMENT_BYTES) throw new AdminError(413, 'That file is over 4 MB.')
    const kind = String(form.get('kind') || 'general') as ClientDocumentKind
    if (!KINDS.includes(kind)) throw new AdminError(400, 'kind must be assessment_360 or general.')
    const title = String(form.get('title') || '').trim().slice(0, 200) || null
    const confirmName = form.get('confirmName') === '1'
    const bytes = Buffer.from(await file.arrayBuffer())
    const result = await createClientDocument(
      supabase,
      { clientId: client.id, orgId: client.org_id, kind, bytes, filename: file.name, title, uploaderRole: 'coach', uploadedBy: actor.id, visibleToCoach: true },
      { confirmName }
    )
    if (result.document.kind === 'assessment_360' && result.document.extraction_status === 'complete') {
      const f = ((client.portal_features as PortalFeatures) || {}) as PortalFeatures
      if (!f.assessments) await supabase.from('clients').update({ portal_features: { ...f, assessments: true } }).eq('id', client.id)
    }
    await logAdminAction(supabase, { actorCoachId: actor.id, action: 'document_uploaded', targetClientId: client.id, detail: { document_id: result.document.id, kind: result.document.kind, promoted_from: result.promotedTo360 ? kind : undefined, status: result.document.extraction_status, via: 'portal_user' } })
    const { extracted_text: _t, structured_data: _s, ...document } = result.document
    return NextResponse.json({ document, message: result.message }, { status: 201 })
  } catch (e) {
    if (e instanceof DocumentError) return NextResponse.json({ error: e.message }, { status: e.status })
    return adminErrorResponse(e)
  }
}
