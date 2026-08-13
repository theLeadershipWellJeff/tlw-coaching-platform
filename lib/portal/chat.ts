/**
 * Client Portal AI chat — context + generation. The model sees ONLY the client's
 * own coaching goals and session transcripts (scoped by clientId); never
 * key_info, coach notes, or any other coach-private field.
 */
import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import type { CoachingGoal } from '@/lib/supabase/types'

const MODEL = process.env.PORTAL_CHAT_MODEL || 'claude-sonnet-4-6'
// Cap the transcript corpus fed as context so we stay within a sane token budget.
const TRANSCRIPT_CHAR_BUDGET = 40000

export type ChatMsg = { role: 'user' | 'assistant'; content: string }

/** Build the system prompt for a client's chat from their goals + transcripts. */
export async function buildChatContext(clientId: string): Promise<{ clientName: string; system: string }> {
  const supabase = getSupabaseAdmin()

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, coaching_goals')
    .eq('id', clientId)
    .maybeSingle()
  const clientName = client?.name || 'the client'
  const goals: CoachingGoal[] = Array.isArray(client?.coaching_goals)
    ? (client!.coaching_goals as CoachingGoal[])
    : []

  const { data: transcripts } = await supabase
    .from('transcripts')
    .select('title, session_date, raw_md')
    .eq('client_id', clientId)
    .order('session_date', { ascending: false, nullsFirst: false })
    .limit(30)

  let budget = TRANSCRIPT_CHAR_BUDGET
  const parts: string[] = []
  for (const t of transcripts || []) {
    if (budget <= 0) break
    const chunk = (t.raw_md || '').slice(0, budget)
    if (!chunk) continue
    budget -= chunk.length
    parts.push(
      `## Session${t.session_date ? ` — ${t.session_date}` : ''}${t.title ? ` (${t.title})` : ''}\n${chunk}`
    )
  }

  const goalsText = goals.length
    ? goals
        .map((g) => `- ${g.title}${g.description ? `: ${g.description}` : ''}`)
        .join('\n')
    : '(no goals recorded yet)'

  const system = `You are a warm, insightful coaching assistant for ${clientName}, a client of theLeadershipWell coaching practice. You help them reflect between sessions, drawing on their own coaching goals and session history below.

Guidelines:
- Be supportive, concise, and reflective. Ask thoughtful questions that help ${clientName} think for themselves rather than just giving answers.
- Ground responses in their goals and sessions when relevant; refer to specifics from the material.
- You are a companion for reflection, NOT a replacement for their coach. For anything urgent, sensitive, clinical, or crisis-related, gently encourage them to contact their coach (or an appropriate professional) directly.
- Never invent facts about their sessions. If something isn't in the material below, say you don't have it.
- Keep a natural, encouraging tone. No clinical or diagnostic language.

${clientName}'S COACHING GOALS:
${goalsText}

${clientName}'S SESSION HISTORY:
${parts.join('\n\n') || '(no sessions on file yet)'}`

  return { clientName, system }
}

/** Generate the assistant's reply. Returns '' on failure (caller handles). */
export async function generateChatReply(system: string, messages: ChatMsg[]): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured.')
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const message = await anthropic.messages.create(
    {
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    },
    { timeout: 50_000, maxRetries: 1 }
  )
  const block = message.content.find((b) => b.type === 'text')
  return block && 'text' in block ? block.text.trim() : ''
}
