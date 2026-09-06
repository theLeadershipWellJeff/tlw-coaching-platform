/**
 * Client Portal AI chat — context + generation. The model sees ONLY the client's
 * own coaching goals, session transcripts, and the session notes the coach chose
 * to SEND them (migration 050) — all scoped by clientId. It never sees key_info,
 * the `notes` table, or any other coach-private field.
 *
 * Context is RETRIEVED, not stuffed. The previous version filled a ~40k-character
 * budget with the newest transcripts and stopped, so a client more than a handful
 * of sessions in silently lost their oldest material — which is exactly what they
 * come here to remember. Now each turn combines:
 *   1. the most recent sessions (recency genuinely matters in coaching), and
 *   2. passages retrieved from their WHOLE history by relevance to the question
 *      (`portal_chat_context`, migration 053).
 * If the retrieval function is missing, this degrades to the old recency-only
 * behaviour rather than failing.
 *
 * Assessment debrief (Phase 3): when `portal_features.assessments` is on and a
 * completed assessment exists, the prompt additionally carries the grounding
 * rules, the active interpretation brief, company vision/values (only when the
 * client has a company), and the most recent report's structured data + verbatims
 * — layered by lib/portal/prompt.ts. The 360 is another grounded source blended
 * with notes and transcripts, never a separate mode.
 */
import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { htmlToPlainText } from '@/lib/communications'
import type { CoachingGoal } from '@/lib/supabase/types'
import { loadLatestAssessmentForChat } from './assessments'
import { loadActiveBrief } from './briefs'
import { loadCompanyContext } from './company'
import { composeChatSystem } from './prompt'

const MODEL = process.env.PORTAL_CHAT_MODEL || 'claude-sonnet-4-6'

/** Newest sessions always included, and how much of each. */
const RECENT_SESSION_COUNT = 4
const RECENT_SESSION_CHARS = 6000
/** Budget for question-relevant passages pulled from the full history. */
const RETRIEVED_CHAR_BUDGET = 24000
/** Sent notes are short and dense — the coach's own summary of a session. */
const NOTES_CHAR_BUDGET = 8000

export type ChatMsg = { role: 'user' | 'assistant'; content: string }

function clip(text: string, max: number): string {
  const t = (text || '').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

/**
 * Build the system prompt for a client's chat.
 *
 * `query` is the client's current question — it drives retrieval. With no query
 * (a fresh conversation), the context is recency-only, which is the right
 * default for "what have we been working on lately".
 */
export type ChatContextMeta = {
  brief_slug?: string
  brief_version?: number
  assessment_document_id?: string
  has_comparison?: boolean
}

export async function buildChatContext(
  clientId: string,
  query?: string
): Promise<{ clientName: string; system: string; meta: ChatContextMeta }> {
  const supabase = getSupabaseAdmin()

  const { data: client } = await supabase
    .from('clients')
    .select('id, org_id, name, coaching_goals')
    .eq('id', clientId)
    .maybeSingle()
  const clientName = client?.name || 'the client'
  const goals: CoachingGoal[] = Array.isArray(client?.coaching_goals)
    ? (client!.coaching_goals as CoachingGoal[])
    : []

  const [{ data: recent }, { data: sentNotes }, { data: coachLinks }, assessment, company] = await Promise.all([
    supabase
      .from('transcripts')
      .select('id, title, session_date, raw_md')
      .eq('client_id', clientId)
      .order('session_date', { ascending: false, nullsFirst: false })
      .limit(RECENT_SESSION_COUNT),
    supabase
      .from('communications')
      .select('subject, body_html, sent_at')
      .eq('client_id', clientId)
      .eq('type', 'session_note')
      .eq('direction', 'outbound')
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
      .limit(20),
    supabase.from('coach_clients').select('coach_id').eq('client_id', clientId).limit(1),
    loadLatestAssessmentForChat(clientId).catch((e) => {
      console.error('assessment context unavailable:', e)
      return null
    }),
    loadCompanyContext(clientId).catch(() => null),
  ])
  const hasCoach = (coachLinks?.length ?? 0) > 0
  const brief = assessment && client?.org_id ? await loadActiveBrief(client.org_id, 'assessment_360').catch(() => null) : null

  const recentIds = new Set((recent ?? []).map((t) => t.id))
  const recentParts = (recent ?? [])
    .map((t) => {
      const body = clip(t.raw_md || '', RECENT_SESSION_CHARS)
      if (!body) return ''
      return `## Session${t.session_date ? ` — ${t.session_date}` : ''}${
        t.title ? ` (${t.title})` : ''
      }\n${body}`
    })
    .filter(Boolean)

  // Question-relevant passages from the whole engagement, including sessions far
  // outside the recent window. Skips anything already included in full above.
  const retrievedParts: string[] = []
  const trimmedQuery = (query || '').trim()
  if (trimmedQuery.length >= 2) {
    try {
      const { data: hits, error } = await supabase.rpc('portal_chat_context', {
        p_client_id: clientId,
        p_query: trimmedQuery,
        p_limit: 8,
      })
      if (error) throw new Error(error.message)
      let budget = RETRIEVED_CHAR_BUDGET
      for (const hit of hits ?? []) {
        if (budget <= 0) break
        if (hit.kind === 'session' && recentIds.has(hit.id)) continue
        const excerpt = clip(hit.excerpt || '', budget)
        if (!excerpt) continue
        budget -= excerpt.length
        const label = hit.kind === 'note' ? 'Notes' : 'Session'
        retrievedParts.push(
          `## ${label}${hit.occurred_on ? ` — ${hit.occurred_on}` : ''} (${hit.title})\n${excerpt}`
        )
      }
    } catch (e) {
      // Migration 053 not applied, or the query produced no lexemes. Recency-only
      // context is still a working chat.
      console.error('portal_chat_context unavailable:', e)
    }
  }

  let notesBudget = NOTES_CHAR_BUDGET
  const noteParts: string[] = []
  for (const n of sentNotes || []) {
    if (notesBudget <= 0) break
    const chunk = clip(htmlToPlainText(n.body_html || ''), notesBudget)
    if (!chunk) continue
    notesBudget -= chunk.length
    const date = n.sent_at ? new Date(n.sent_at).toISOString().slice(0, 10) : ''
    noteParts.push(`## Notes${date ? ` — ${date}` : ''}${n.subject ? ` (${n.subject})` : ''}\n${chunk}`)
  }

  const system = composeChatSystem({
    clientName,
    hasCoach,
    brief: brief ? { slug: brief.slug, version: brief.version, body: brief.body } : null,
    company: company ? { name: company.name, vision: company.vision, values: company.values } : null,
    assessment: assessment ? { data: assessment.data, assessmentCount: assessment.assessmentCount } : null,
    goals,
    noteParts,
    recentParts,
    retrievedParts,
  })

  const meta: ChatContextMeta = {}
  if (brief) {
    meta.brief_slug = brief.slug
    meta.brief_version = brief.version
  }
  if (assessment) {
    meta.assessment_document_id = assessment.documentId
    meta.has_comparison = !!assessment.data.comparison
  }

  return { clientName, system, meta }
}

function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured.')
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

const MAX_TOKENS = 4096

/**
 * Stream the assistant's reply. Yields text deltas as they arrive so the portal
 * can render progressively instead of showing a spinner for the whole call.
 */
export async function* streamChatReply(
  system: string,
  messages: ChatMsg[]
): AsyncGenerator<string, void, unknown> {
  const stream = anthropic().messages.stream(
    {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    },
    { timeout: 120_000, maxRetries: 1 }
  )
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text
    }
  }
}

/** Non-streaming reply. Returns '' on failure (caller handles). */
export async function generateChatReply(system: string, messages: ChatMsg[]): Promise<string> {
  const message = await anthropic().messages.create(
    {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    },
    { timeout: 120_000, maxRetries: 1 }
  )
  const block = message.content.find((b) => b.type === 'text')
  return block && 'text' in block ? block.text.trim() : ''
}
