import { NextRequest, NextResponse } from 'next/server'
import { adminContext, adminErrorResponse } from '@/lib/admin/route'
import { AdminError } from '@/lib/admin/debrief'
import { logAdminAction } from '@/lib/admin/audit'
import { createCompanyDocument, listCompanyDocuments } from '@/lib/documents/company'

export const runtime = 'nodejs'
export const maxDuration = 60

/** A company's uploaded material (metadata only). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase } = await adminContext()
    const documents = await listCompanyDocuments(supabase, params.id)
    return NextResponse.json({ documents })
  } catch (e) {
    return adminErrorResponse(e)
  }
}

/**
 * Upload sponsor material for a company. Multipart: file (PDF / Word / text),
 * title (optional), includeInChat ("0" to keep it as reference only). The
 * extracted text joins the chat context of every client at THIS company only.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase, actor } = await adminContext()
    const { data: company } = await supabase.from('companies').select('id, org_id').eq('id', params.id).maybeSingle()
    if (!company) throw new AdminError(404, 'Company not found.')
    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) throw new AdminError(400, 'Choose a file to upload.')
    const doc = await createCompanyDocument(supabase, {
      companyId: company.id,
      orgId: company.org_id,
      bytes: Buffer.from(await file.arrayBuffer()),
      filename: file.name,
      title: String(form?.get('title') || '').trim() || null,
      uploadedBy: actor.id,
      includeInChat: String(form?.get('includeInChat') || '1') !== '0',
    })
    await logAdminAction(supabase, { actorCoachId: actor.id, action: 'company_updated', detail: { company_id: company.id, document_id: doc.id, status: doc.extraction_status } })
    const { extracted_text, ...rest } = doc
    return NextResponse.json({ document: { ...rest, text_chars: extracted_text?.length || 0 } }, { status: 201 })
  } catch (e) {
    return adminErrorResponse(e)
  }
}
