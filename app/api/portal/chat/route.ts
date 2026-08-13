import { NextRequest, NextResponse } from 'next/server'
import { getPortalClientId } from '@/lib/portal/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { buildChatContext, generateChatReply, type ChatMsg } from '@/lib/portal/chat'

export const runtime = 'nodejs'
export const maxDuration = 60

/** List this client's conversations (most recently active first). */
export async function GET() {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('portal_conversations')
    .select('id, title, updated_at')
    .eq('client_id', clientId)
    .order('updated_at', { ascending: false })
    .limit(50)
  return NextResponse.json({ conversations: data || [] })
}

/** Send a message. Creates a conversation if none is given, persists the user
 *  message, generates + persists the assistant reply. */
export async function POST(req: NextRequest) {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const content = String(body.content || '').trim()
  let conversationId: string | null = body.conversationId ? String(body.conversationId) : null
  if (!content) return NextResponse.json({ error: 'Message is empty.' }, { status: 400 })
  if (content.length > 8000) return NextResponse.json({ error: 'Message is too long.' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data: client } = await supabase
    .from('clients')
    .select('id, org_id')
    .eq('id', clientId)
    .maybeSingle()
  if (!client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ownership of an existing conversation, or start a new one.
  if (conversationId) {
    const { data: conv } = await supabase
      .from('portal_conversations')
      .select('id, client_id')
      .eq('id', conversationId)
      .maybeSingle()
    if (!conv || conv.client_id !== clientId) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }
  } else {
    const title = content.length > 48 ? content.slice(0, 48).trim() + '…' : content
    const { data: conv, error } = await supabase
      .from('portal_conversations')
      .insert({ client_id: clientId, org_id: client.org_id, title })
      .select('id')
      .single()
    if (error || !conv) {
      return NextResponse.json({ error: 'Could not start a conversation.' }, { status: 500 })
    }
    conversationId = conv.id
  }

  // Persist the user message, then generate against the full thread.
  await supabase
    .from('portal_messages')
    .insert({ conversation_id: conversationId, org_id: client.org_id, role: 'user', content })

  const { data: history } = await supabase
    .from('portal_messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(40)
  const msgs: ChatMsg[] = (history || []).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }))

  let reply = ''
  try {
    const { system } = await buildChatContext(clientId)
    reply = await generateChatReply(system, msgs)
  } catch {
    reply = ''
  }
  if (!reply) {
    return NextResponse.json(
      { error: 'The assistant is unavailable right now. Please try again.', conversationId },
      { status: 502 }
    )
  }

  await supabase
    .from('portal_messages')
    .insert({ conversation_id: conversationId, org_id: client.org_id, role: 'assistant', content: reply })
  await supabase
    .from('portal_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId)

  return NextResponse.json({ conversationId, reply })
}
