import { NextRequest, NextResponse } from 'next/server'
import { getPortalClientId } from '@/lib/portal/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { logPortalAccess } from '@/lib/portal/access'
import { logPortalEvent } from '@/lib/portal/events'

export const runtime = 'nodejs'

/**
 * A client changes the coach-visibility of their OWN assessment document
 * (build prompt §4: kind + client choice). Body: { visibleToCoach: boolean }.
 * A personnel review is never visible to a coach and cannot be switched.
 * Scoped to the session client — someone else's id 404s.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  if (typeof body?.visibleToCoach !== 'boolean') {
    return NextResponse.json({ error: 'visibleToCoach must be true or false.' }, { status: 400 })
  }
  const supabase = getSupabaseAdmin()
  const { data: doc } = await supabase
    .from('client_documents')
    .select('id, kind')
    .eq('id', params.id)
    .eq('client_id', clientId)
    .maybeSingle()
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (doc.kind === 'personnel_review') {
    return NextResponse.json({ error: 'A personnel review is never shared with a coach.' }, { status: 400 })
  }
  const { error } = await supabase.from('client_documents').update({ visible_to_coach: body.visibleToCoach }).eq('id', doc.id).eq('client_id', clientId)
  if (error) return NextResponse.json({ error: 'Could not update.' }, { status: 500 })
  await logPortalAccess(clientId, 'document_visibility', { detail: `${doc.id}:${body.visibleToCoach ? 'visible' : 'hidden'}` })
  await logPortalEvent(clientId, 'document_visibility_changed', { document_id: doc.id, visible_to_coach: body.visibleToCoach })
  return NextResponse.json({ ok: true, visible_to_coach: body.visibleToCoach })
}
