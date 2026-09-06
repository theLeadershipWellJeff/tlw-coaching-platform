import { NextRequest, NextResponse } from 'next/server'
import { adminContext, adminErrorResponse } from '@/lib/admin/route'
import { AdminError } from '@/lib/admin/debrief'
import { logAdminAction } from '@/lib/admin/audit'
import { deleteClientDocument, retryExtraction } from '@/lib/documents/pipeline'
import type { ClientDocument, PortalFeatures } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Retry extraction from the command center. Body: { confirmName?: true } to
 * accept a surfaced name mismatch after a human has checked the report is
 * this client's. Personnel reviews are never retried from here (their content
 * is the client's alone).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase, actor } = await adminContext()
    const { data: doc } = await supabase.from('client_documents').select('id, client_id, kind').eq('id', params.id).maybeSingle()
    if (!doc) throw new AdminError(404, 'Document not found.')
    if (doc.kind === 'personnel_review') throw new AdminError(400, 'A personnel review is private to the client.')
    const body = await req.json().catch(() => ({}))
    const result = await retryExtraction(supabase, doc.id, { confirmName: body?.confirmName === true })
    if (result.document.kind === 'assessment_360' && result.document.extraction_status === 'complete') {
      const { data: c } = await supabase.from('clients').select('portal_features').eq('id', doc.client_id).maybeSingle()
      const f = ((c?.portal_features as PortalFeatures) || {}) as PortalFeatures
      if (!f.assessments) await supabase.from('clients').update({ portal_features: { ...f, assessments: true } }).eq('id', doc.client_id)
    }
    await logAdminAction(supabase, { actorCoachId: actor.id, action: 'document_retry', targetClientId: doc.client_id, detail: { document_id: doc.id, confirm_name: body?.confirmName === true, status: result.document.extraction_status } })
    const { extracted_text: _t, structured_data: _s, ...document } = result.document
    return NextResponse.json({ document, message: result.message })
  } catch (e) {
    return adminErrorResponse(e)
  }
}

/** Remove a document (row + file). Personnel reviews cannot be removed from here. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase, actor } = await adminContext()
    const { data: doc } = await supabase.from('client_documents').select('*').eq('id', params.id).maybeSingle()
    if (!doc) throw new AdminError(404, 'Document not found.')
    if (doc.kind === 'personnel_review') throw new AdminError(400, 'A personnel review is private to the client.')
    await deleteClientDocument(supabase, doc as ClientDocument)
    await logAdminAction(supabase, { actorCoachId: actor.id, action: 'document_deleted', targetClientId: doc.client_id, detail: { document_id: doc.id, kind: doc.kind } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return adminErrorResponse(e)
  }
}
