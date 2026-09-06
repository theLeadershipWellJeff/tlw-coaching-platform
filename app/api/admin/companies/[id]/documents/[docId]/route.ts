import { NextRequest, NextResponse } from 'next/server'
import { adminContext, adminErrorResponse } from '@/lib/admin/route'
import { AdminError } from '@/lib/admin/debrief'
import { logAdminAction } from '@/lib/admin/audit'
import { deleteCompanyDocument } from '@/lib/documents/company'

export const runtime = 'nodejs'

/** Toggle whether a company document feeds the chat. Body: { includeInChat: boolean }. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string; docId: string } }) {
  try {
    const { supabase, actor } = await adminContext()
    const body = await req.json().catch(() => ({}))
    if (typeof body.includeInChat !== 'boolean') throw new AdminError(400, 'includeInChat must be true or false.')
    const { data, error } = await supabase
      .from('company_documents')
      .update({ include_in_chat: body.includeInChat })
      .eq('id', params.docId)
      .eq('company_id', params.id)
      .select('id, include_in_chat')
      .maybeSingle()
    if (error) throw new AdminError(500, error.message)
    if (!data) throw new AdminError(404, 'Document not found.')
    await logAdminAction(supabase, { actorCoachId: actor.id, action: 'company_updated', detail: { company_id: params.id, document_id: params.docId, include_in_chat: body.includeInChat } })
    return NextResponse.json({ ok: true, include_in_chat: data.include_in_chat })
  } catch (e) {
    return adminErrorResponse(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; docId: string } }) {
  try {
    const { supabase, actor } = await adminContext()
    const { data: doc } = await supabase.from('company_documents').select('id, storage_path').eq('id', params.docId).eq('company_id', params.id).maybeSingle()
    if (!doc) throw new AdminError(404, 'Document not found.')
    await deleteCompanyDocument(supabase, doc)
    await logAdminAction(supabase, { actorCoachId: actor.id, action: 'company_updated', detail: { company_id: params.id, document_deleted: params.docId } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return adminErrorResponse(e)
  }
}
