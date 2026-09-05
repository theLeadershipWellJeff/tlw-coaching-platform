import { NextRequest, NextResponse } from 'next/server'
import { getPortalClientId } from '@/lib/portal/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { logPortalAccess } from '@/lib/portal/access'
import { logPortalEvent } from '@/lib/portal/events'
import { signedDocumentUrl } from '@/lib/documents/storage'

export const runtime = 'nodejs'

/**
 * Download the client's OWN document: 302 to a short-lived signed URL with
 * Content-Disposition: attachment. Always available — extraction status gates
 * the AI grounding, never the participant's access to their own file — and
 * there is deliberately no setting anywhere that can disable it (build
 * prompt §5e). Scoped to the session client; another client's id 404s.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = getSupabaseAdmin()
  const { data: doc } = await supabase
    .from('client_documents')
    .select('id, title, storage_path')
    .eq('id', params.id)
    .eq('client_id', clientId)
    .maybeSingle()
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const url = await signedDocumentUrl(supabase, doc.storage_path, {
    downloadAs: `${(doc.title || 'report').replace(/[^\w.-]+/g, '_')}.pdf`,
  })
  if (!url) return NextResponse.json({ error: 'Could not open the file.' }, { status: 502 })
  await logPortalAccess(clientId, 'document_download', { detail: doc.id })
  await logPortalEvent(clientId, 'document_downloaded', { document_id: doc.id })
  return NextResponse.redirect(url)
}
