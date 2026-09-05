import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireClientCoach } from '@/lib/client-access'
import { toErrorResponse } from '@/lib/api-handler'
import { createClientDocument, DocumentError, listCoachVisibleDocuments } from '@/lib/documents/pipeline'
import type { ClientDocumentKind, PortalFeatures } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const maxDuration = 60

/** Documents on this client the coach may see (visible_to_coach enforced at the query). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)
    const documents = await listCoachVisibleDocuments(supabase, params.id)
    return NextResponse.json({ documents })
  } catch (e) {
    return toErrorResponse(e)
  }
}

/**
 * Coach upload of an assessment report (or company doc) for this client.
 * Multipart: file (PDF), kind (default assessment_360), title (optional),
 * confirmName ("1" to accept a name mismatch already surfaced), enableAssessments
 * ("0" to leave portal_features.assessments untouched; default flips it on for
 * an assessment_360 so the client's portal shows the card once extraction is
 * complete — the upload IS the switch, no re-onboarding).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireClientCoach(supabase, params.id)

    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'A PDF file is required.' }, { status: 400 })
    const kind = (String(form?.get('kind') || 'assessment_360') as ClientDocumentKind)
    if (!['assessment_360', 'company_doc'].includes(kind)) {
      return NextResponse.json({ error: 'Coaches can upload assessment reports or company documents.' }, { status: 400 })
    }
    const title = String(form?.get('title') || '').trim() || null
    const confirmName = String(form?.get('confirmName') || '') === '1'
    const enableAssessments = String(form?.get('enableAssessments') || '1') !== '0'

    const { data: client } = await supabase.from('clients').select('id, org_id, portal_features').eq('id', params.id).maybeSingle()
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

    const result = await createClientDocument(
      supabase,
      {
        clientId: client.id,
        orgId: client.org_id,
        kind,
        bytes: Buffer.from(await file.arrayBuffer()),
        filename: file.name,
        title,
        uploaderRole: 'coach',
        uploadedBy: coach.id,
        visibleToCoach: true,
      },
      { confirmName }
    )

    if (kind === 'assessment_360' && enableAssessments && result.document.extraction_status === 'complete') {
      const features = ((client.portal_features as PortalFeatures) || {}) as PortalFeatures
      if (!features.assessments) {
        await supabase.from('clients').update({ portal_features: { ...features, assessments: true } }).eq('id', client.id)
      }
    }

    const { extracted_text: _t, structured_data: _s, ...document } = result.document
    return NextResponse.json({ document, message: result.message }, { status: 201 })
  } catch (e) {
    if (e instanceof DocumentError) return NextResponse.json({ error: e.message }, { status: e.status })
    return toErrorResponse(e)
  }
}
