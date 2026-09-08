import { NextRequest, NextResponse } from 'next/server'
import { getPortalClientId } from '@/lib/portal/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { checkPortalRateLimit, logPortalAccess } from '@/lib/portal/access'
import { logPortalEvent } from '@/lib/portal/events'
import { describeFailure, DocumentError, retryExtraction } from '@/lib/documents/pipeline'
import { notifyDocumentFailure } from '@/lib/documents/notify'
import { portalOutcomeMessage } from '@/lib/portal/documents'
import type { PortalFeatures } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * The client re-runs extraction on one of their OWN failed/unsupported
 * documents — typically after correcting their name in Settings so the name
 * gate passes. The gate is NOT bypassed here (no confirmName: a client cannot
 * wave through a report that is not theirs; a coach or the command center can,
 * having checked). A complete 360 switches the assessment surfaces on, exactly
 * as a fresh upload does. Scoped to the session client; someone else's id 404s.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const limit = await checkPortalRateLimit(clientId, 'document_upload')
  if (!limit.allowed) return NextResponse.json({ error: 'Please try again in a little while.' }, { status: 429 })

  const supabase = getSupabaseAdmin()
  const { data: doc } = await supabase
    .from('client_documents')
    .select('id, kind, extraction_status')
    .eq('id', params.id)
    .eq('client_id', clientId)
    .maybeSingle()
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (doc.extraction_status !== 'failed' && doc.extraction_status !== 'unsupported') {
    return NextResponse.json({ error: 'This document does not need a retry.' }, { status: 400 })
  }
  const { data: client } = await supabase.from('clients').select('id, name, email, portal_features').eq('id', clientId).maybeSingle()
  if (!client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const result = await retryExtraction(supabase, doc.id)
    const d = result.document
    if (d.kind === 'assessment_360' && d.extraction_status === 'complete') {
      const f = ((client.portal_features as PortalFeatures) || {}) as PortalFeatures
      if (!f.assessments) await supabase.from('clients').update({ portal_features: { ...f, assessments: true } }).eq('id', client.id)
    }
    const reason = describeFailure(d)
    if (reason) await notifyDocumentFailure({ client, document: d, action: 'retry', by: 'client' })
    await logPortalAccess(clientId, 'document_upload', { detail: `retry:${d.kind}:${d.id}`, ok: d.extraction_status === 'complete' })
    await logPortalEvent(clientId, 'document_retried', { document_id: d.id, kind: d.kind, status: d.extraction_status })
    return NextResponse.json({
      document: { id: d.id, kind: d.kind, title: d.title, extraction_status: d.extraction_status, assessment_date: d.assessment_date, visible_to_coach: d.visible_to_coach, reason },
      message: portalOutcomeMessage(d.kind, reason, false),
    })
  } catch (e) {
    if (e instanceof DocumentError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error('portal document retry failed:', e)
    return NextResponse.json({ error: 'Could not retry right now.' }, { status: 500 })
  }
}
