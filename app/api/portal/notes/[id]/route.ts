import { NextRequest, NextResponse } from 'next/server'
import { getPortalClientId } from '@/lib/portal/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { checkPortalRateLimit, logPortalAccess } from '@/lib/portal/access'
import { logPortalEvent } from '@/lib/portal/events'
import { cleanNoteInput } from '@/lib/portal/notes'

export const runtime = 'nodejs'

/** Edit one of the client's notes. Body: { title?, body }. Filtered on client_id in the write itself. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const limit = await checkPortalRateLimit(clientId, 'note_write')
  if (!limit.allowed) return NextResponse.json({ error: 'Please slow down a little and try again shortly.' }, { status: 429 })
  const body = await req.json().catch(() => ({}))
  const cleaned = cleanNoteInput(body)
  if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 })
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('portal_notes')
    .update({ title: cleaned.title, body: cleaned.body, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('client_id', clientId)
    .select('id, title, body, created_at, updated_at')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await logPortalAccess(clientId, 'note_write', { detail: `edit:${data.id}` })
  await logPortalEvent(clientId, 'note_saved', { note_id: data.id, chars: cleaned.body.length })
  return NextResponse.json({ note: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('portal_notes').delete().eq('id', params.id).eq('client_id', clientId).select('id').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await logPortalAccess(clientId, 'note_write', { detail: `delete:${params.id}` })
  return NextResponse.json({ ok: true })
}
