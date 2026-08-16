import { NextRequest, NextResponse } from 'next/server'
import { getPortalClientId } from '@/lib/portal/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'

export const runtime = 'nodejs'

/** Load a conversation's messages — only if it belongs to the authenticated
 *  portal client. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data: conv } = await supabase
    .from('portal_conversations')
    .select('id, client_id, title')
    .eq('id', params.id)
    .maybeSingle()
  if (!conv || conv.client_id !== clientId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: messages } = await supabase
    .from('portal_messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', params.id)
    .order('created_at', { ascending: true })

  return NextResponse.json({ title: conv.title, messages: messages || [] })
}

/** Rename a conversation. Scoped to the authenticated portal client. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const title = String(body.title || '').trim().slice(0, 120)
  if (!title) return NextResponse.json({ error: 'A title is required.' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  // Filter on client_id in the update itself, so another client's id can never
  // be renamed even if the ownership read raced.
  const { data, error } = await supabase
    .from('portal_conversations')
    .update({ title })
    .eq('id', params.id)
    .eq('client_id', clientId)
    .select('id, title')
    .maybeSingle()
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ conversation: data })
}

/** Delete a conversation (messages cascade). Scoped to the portal client. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('portal_conversations')
    .delete()
    .eq('id', params.id)
    .eq('client_id', clientId)
    .select('id')
    .maybeSingle()
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
