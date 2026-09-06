import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireClientCoach } from '@/lib/client-access'
import { toErrorResponse } from '@/lib/api-handler'
import { deleteClientDocument, DocumentError } from '@/lib/documents/pipeline'
import { signedDocumentUrl } from '@/lib/documents/storage'
import type { ClientDocument } from '@/lib/supabase/types'

export const runtime = 'nodejs'

/** Coach-visible document only — a personnel review 404s here, never 403. */
async function loadVisible(clientId: string, docId: string): Promise<ClientDocument | null> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('client_documents')
    .select('*')
    .eq('id', docId)
    .eq('client_id', clientId)
    .eq('visible_to_coach', true)
    .neq('kind', 'personnel_review')
    .maybeSingle()
  return (data as ClientDocument) || null
}

/** GET ?download=1 → 302 to a short-lived signed URL; otherwise the row + structured data. */
export async function GET(req: NextRequest, { params }: { params: { id: string; docId: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)
    const doc = await loadVisible(params.id, params.docId)
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (req.nextUrl.searchParams.get('download') === '1') {
      const url = await signedDocumentUrl(supabase, doc.storage_path, { downloadAs: `${(doc.title || 'report').replace(/[^\w.-]+/g, '_')}.pdf` })
      if (!url) return NextResponse.json({ error: 'Could not open the file.' }, { status: 502 })
      return NextResponse.redirect(url)
    }
    const { extracted_text: _t, ...rest } = doc
    return NextResponse.json({ document: rest })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; docId: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)
    const doc = await loadVisible(params.id, params.docId)
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await deleteClientDocument(supabase, doc)
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof DocumentError) return NextResponse.json({ error: e.message }, { status: e.status })
    return toErrorResponse(e)
  }
}
