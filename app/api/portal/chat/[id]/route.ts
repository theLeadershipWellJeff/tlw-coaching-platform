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
