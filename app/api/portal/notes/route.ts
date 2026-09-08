import { NextRequest, NextResponse } from 'next/server'
import { getPortalClientId } from '@/lib/portal/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { checkPortalRateLimit, logPortalAccess } from '@/lib/portal/access'
import { logPortalEvent } from '@/lib/portal/events'
import { cleanNoteInput, MAX_PORTAL_NOTES } from '@/lib/portal/notes'

export const runtime = 'nodejs'

/**
 * "My notes" — the client's private journal (migration 063). Scoped to the
 * session client; never readable coach-side. A missing table reads as no
 * notes so a deploy ahead of the migration still renders the page.
 */
export async function GET() {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('portal_notes')
    .select('id, title, body, created_at, updated_at')
    .eq('client_id', clientId)
    .order('updated_at', { ascending: false })
    .limit(200)
  if (error) return NextResponse.json({ notes: [], unavailable: true })
  return NextResponse.json({ notes: data || [] })
}

/** Create a note. Body: { title?, body }. */
export async function POST(req: NextRequest) {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const limit = await checkPortalRateLimit(clientId, 'note_write')
  if (!limit.allowed) return NextResponse.json({ error: 'Please slow down a little and try again shortly.' }, { status: 429 })
  const body = await req.json().catch(() => ({}))
  const cleaned = cleanNoteInput(body)
  if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 })
  const supabase = getSupabaseAdmin()
  const { data: client } = await supabase.from('clients').select('org_id').eq('id', clientId).maybeSingle()
  if (!client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { count } = await supabase.from('portal_notes').select('id', { count: 'exact', head: true }).eq('client_id', clientId)
  if ((count || 0) >= MAX_PORTAL_NOTES) return NextResponse.json({ error: `You can keep up to ${MAX_PORTAL_NOTES} notes — remove an old one first.` }, { status: 409 })
  const { data, error } = await supabase
    .from('portal_notes')
    .insert({ client_id: clientId, org_id: client.org_id, title: cleaned.title, body: cleaned.body })
    .select('id, title, body, created_at, updated_at')
    .single()
  if (error || !data) return NextResponse.json({ error: /portal_notes/.test(error?.message || '') ? 'Notes are not available yet.' : error?.message || 'Could not save the note.' }, { status: 500 })
  await logPortalAccess(clientId, 'note_write', { detail: `create:${data.id}` })
  await logPortalEvent(clientId, 'note_saved', { note_id: data.id, chars: cleaned.body.length })
  return NextResponse.json({ note: data }, { status: 201 })
}
