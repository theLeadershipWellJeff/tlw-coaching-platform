import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireClientCoach } from '@/lib/client-access'
import { toErrorResponse } from '@/lib/api-handler'
import { DocumentError, retryExtraction } from '@/lib/documents/pipeline'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Re-run extraction on a failed/unsupported document. Body: { confirmName?: true }
 * to accept a surfaced name mismatch (a human has checked the report is this
 * client's). Coach-visible documents only.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string; docId: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)
    const { data: doc } = await supabase
      .from('client_documents')
      .select('id, client_id, visible_to_coach, kind')
      .eq('id', params.docId)
      .eq('client_id', params.id)
      .maybeSingle()
    if (!doc || !doc.visible_to_coach || doc.kind === 'personnel_review') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const body = await req.json().catch(() => ({}))
    const result = await retryExtraction(supabase, doc.id, { confirmName: body?.confirmName === true })
    const { extracted_text: _t, structured_data: _s, ...document } = result.document
    return NextResponse.json({ document, message: result.message })
  } catch (e) {
    if (e instanceof DocumentError) return NextResponse.json({ error: e.message }, { status: e.status })
    return toErrorResponse(e)
  }
}
