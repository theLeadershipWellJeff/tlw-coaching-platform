import { NextRequest, NextResponse } from 'next/server'
import { getPortalClientId } from '@/lib/portal/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { buildChatContext, streamChatReply, type ChatMsg } from '@/lib/portal/chat'
import { checkPortalRateLimit, logPortalAccess } from '@/lib/portal/access'

export const runtime = 'nodejs'
export const maxDuration = 300

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

/**
 * Send a message. Creates a conversation if none is given, persists the user
 * message, then STREAMS the assistant reply back as plain text and persists it
 * once the stream completes.
 *
 * The conversation id rides on the `X-Conversation-Id` response header so a new
 * thread can be adopted by the client without waiting for the body to finish.
 */
export async function POST(req: NextRequest) {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limit = await checkPortalRateLimit(clientId, 'chat')
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'You have sent a lot of messages just now — please try again in a little while.' },
      { status: 429 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const content = String(body.content || '').trim()
  let conversationId: string | null = body.conversationId ? String(body.conversationId) : null
  if (!content) return NextResponse.json({ error: 'Message is empty.' }, { status: 400 })
  if (content.length > 8000) return NextResponse.json({ error: 'Message is too long.' }, { status: 400 })

  // Optional document the client attached this turn (extracted text from the
  // upload route). Included in the model context for THIS turn only; only a short
  // filename marker is persisted with the message.
  const attachment =
    body.attachment && typeof body.attachment.text === 'string' && body.attachment.text.trim()
      ? {
          filename: String(body.attachment.filename || 'document').slice(0, 200),
          text: String(body.attachment.text).slice(0, 30000),
        }
      : null

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

  const persistedContent = attachment ? `${content}\n\n📎 Attached: ${attachment.filename}` : content
  await supabase
    .from('portal_messages')
    .insert({ conversation_id: conversationId, org_id: client.org_id, role: 'user', content: persistedContent })

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
  if (attachment && msgs.length) {
    const last = msgs[msgs.length - 1]
    last.content = `${last.content}\n\n[Attached document "${attachment.filename}"]:\n${attachment.text}`
  }

  await logPortalAccess(clientId, 'chat', { detail: conversationId ?? undefined })

  let system: string
  try {
    // The current question drives retrieval across the client's whole history.
    ;({ system } = await buildChatContext(clientId, content))
  } catch (e) {
    console.error('portal chat context failed:', e)
    return NextResponse.json(
      { error: 'The assistant is unavailable right now. Please try again.', conversationId },
      { status: 502 }
    )
  }

  const convId = conversationId
  const orgId = client.org_id
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = ''
      try {
        for await (const delta of streamChatReply(system, msgs)) {
          full += delta
          controller.enqueue(encoder.encode(delta))
        }
      } catch (e) {
        console.error('portal chat stream failed:', e)
        // Mid-stream failure: the client has already rendered a partial reply, so
        // close cleanly and let what arrived stand rather than throwing it away.
        if (!full) {
          controller.enqueue(
            encoder.encode('The assistant is unavailable right now. Please try again.')
          )
        }
      } finally {
        controller.close()
        if (full.trim()) {
          try {
            const supabase = getSupabaseAdmin()
            await supabase
              .from('portal_messages')
              .insert({ conversation_id: convId, org_id: orgId, role: 'assistant', content: full })
            await supabase
              .from('portal_conversations')
              .update({ updated_at: new Date().toISOString() })
              .eq('id', convId)
          } catch (e) {
            console.error('portal chat persist failed:', e)
          }
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Conversation-Id': conversationId,
    },
  })
}
