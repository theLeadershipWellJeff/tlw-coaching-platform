import { NextRequest, NextResponse } from 'next/server'
import { getPortalClientId } from '@/lib/portal/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { checkPortalRateLimit, logPortalAccess } from '@/lib/portal/access'
import { logPortalEvent } from '@/lib/portal/events'
import { resolveClientCoach } from '@/lib/portal/coach'
import { createClientDocument, DocumentError } from '@/lib/documents/pipeline'
import type { ClientDocumentKind } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const maxDuration = 60

/** The client's own documents — every status, because their file is theirs to
 *  download whatever the extraction said. Never another client's. */
export async function GET() {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('client_documents')
    .select('id, kind, title, size_bytes, extraction_status, uploader_role, visible_to_coach, assessment_date, instrument, supersedes_document_id, created_at')
    .eq('client_id', clientId)
    .order('assessment_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  return NextResponse.json({ documents: data || [] })
}

/**
 * Client self-upload. Multipart: file (PDF), kind (assessment_360 |
 * personnel_review), visibleToCoach ("1"/"0" — only meaningful for an
 * assessment when a coach exists; a personnel review is NEVER coach-visible).
 * Same pipeline as the coach path: caps, header check, and the name gate —
 * which here guards against uploading a colleague's report. A mismatch is
 * stored as failed and surfaced to the command center; the participant gets a
 * plain explanation and their file stays downloadable.
 */
export async function POST(req: NextRequest) {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limit = await checkPortalRateLimit(clientId, 'document_upload')
  if (!limit.allowed) {
    return NextResponse.json({ error: 'You have uploaded several documents just now — please try again in a little while.' }, { status: 429 })
  }

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a PDF to upload.' }, { status: 400 })
  const kind = String(form?.get('kind') || 'assessment_360') as ClientDocumentKind
  if (!['assessment_360', 'personnel_review'].includes(kind)) {
    return NextResponse.json({ error: 'Unsupported document type.' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data: client } = await supabase.from('clients').select('id, org_id').eq('id', clientId).maybeSingle()
  if (!client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Visibility: kind + client choice (build prompt §4). Default for an
  // assessment = visible when a coach exists; the client may switch it any time.
  let visibleToCoach = false
  if (kind === 'assessment_360') {
    const coach = await resolveClientCoach(clientId)
    const choice = form?.get('visibleToCoach')
    visibleToCoach = choice === null || choice === undefined ? Boolean(coach) : String(choice) === '1'
  }

  try {
    const result = await createClientDocument(supabase, {
      clientId: client.id,
      orgId: client.org_id,
      kind,
      bytes: Buffer.from(await file.arrayBuffer()),
      filename: file.name,
      uploaderRole: 'client',
      uploadedBy: null,
      visibleToCoach,
    })
    await logPortalAccess(clientId, 'document_upload', { detail: `${kind}:${result.document.id}`, ok: result.document.extraction_status === 'complete' })
    await logPortalEvent(clientId, 'document_uploaded', { document_id: result.document.id, kind, status: result.document.extraction_status })
    const d = result.document
    const nameMismatch = d.extraction_status === 'failed' && (d.extraction_error || '').startsWith('name_mismatch')
    return NextResponse.json(
      {
        document: { id: d.id, kind: d.kind, title: d.title, extraction_status: d.extraction_status, assessment_date: d.assessment_date, visible_to_coach: d.visible_to_coach },
        message: nameMismatch
          ? 'The name on this report does not match your account, so it has not been added to your portal. If it is your report, contact support and we will check it with you.'
          : d.extraction_status === 'unsupported'
            ? 'We could not read this report layout automatically. Your file is saved and downloadable; support has been notified to review it.'
            : d.extraction_status === 'complete'
              ? 'Your report has been added.'
              : 'Your file is saved, but we could not read it automatically. Support has been notified.',
      },
      { status: 201 }
    )
  } catch (e) {
    if (e instanceof DocumentError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error('portal document upload failed:', e)
    return NextResponse.json({ error: 'Could not upload that file right now.' }, { status: 500 })
  }
}
