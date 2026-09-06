import { NextRequest, NextResponse } from 'next/server'
import { getPortalClientId } from '@/lib/portal/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { checkPortalRateLimit } from '@/lib/portal/access'
import { extractTasksFromConversation } from '@/lib/portal/weekly-plan'
import type { ChatMsg } from '@/lib/portal/chat'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * Propose the Top 5 from a weekly-plan conversation. Returns strings for the
 * client to review and edit — nothing is saved here. Body: { conversationId }.
 */
export async function POST(req: NextRequest) {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const limit = await checkPortalRateLimit(clientId, 'weekly_plan_write')
  if (!limit.allowed) return NextResponse.json({ error: 'Please slow down a little and try again shortly.' }, { status: 429 })
  const body = await req.json().catch(() => ({}))
  const conversationId = String(body.conversationId || '')
  if (!conversationId) return NextResponse.json({ error: 'conversationId is required.' }, { status: 400 })
  const supabase = getSupabaseAdmin()
  const { data: conv } = await supabase.from('portal_conversations').select('id').eq('id', conversationId).eq('client_id', clientId).maybeSingle()
  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data: history } = await supabase.from('portal_messages').select('role, content').eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(60)
  const msgs: ChatMsg[] = (history || []).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
  if (!msgs.some((m) => m.role === 'assistant')) return NextResponse.json({ error: 'Have the conversation first — there is nothing to save yet.' }, { status: 400 })
  try {
    const proposal = await extractTasksFromConversation(msgs)
    return NextResponse.json(proposal)
  } catch (e) {
    console.error('weekly plan extract failed:', e)
    return NextResponse.json({ error: 'Could not read the plan from the conversation. You can still type it in.' }, { status: 502 })
  }
}
