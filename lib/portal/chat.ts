/**
 * Client Portal AI chat — context + generation. The model sees ONLY the client's
 * own coaching goals, session transcripts, and the session notes the coach chose
 * to SEND them (migration 050) — all scoped by clientId. It never sees key_info,
 * the `notes` table, or any other coach-private field.
 *
 * Context is RETRIEVED, not stuffed, and BUDGETED (cost-controls Phase 3):
 * this module loads the client's standing material and composes the prompt
 * PARTS (lib/portal/prompt.ts — a cross-client prefix and a per-client
 * snapshot); lib/portal/context.ts adds the per-question excerpts (the
 * newest sessions' openings + passages ranked against the question by
 * `portal_chat_context`, migration 053 — never a full transcript), the
 * conversation history (last turns verbatim, older summarised), fits every
 * slice to lib/ai/context-budget.ts under the 40k-token ceiling, and sends
 * the parts as cache-controlled blocks. If the retrieval function is missing
 * the excerpts are openings only rather than failing.
 *
 * Assessment debrief (Phase 3): when `portal_features.assessments` is on and a
 * completed assessment exists, the prompt additionally carries the grounding
 * rules, the active interpretation brief, company vision/values (only when the
 * client has a company), and the most recent report's structured data + verbatims
 * — layered by lib/portal/prompt.ts. The 360 is another grounded source blended
 * with notes and transcripts, never a separate mode.
 */
import { aiCreate, aiStream, isAiConfigured, ledgerDone, textOf, type AiTextBlock } from '@/lib/ai/client'
import { CONTEXT_BUDGET, type SliceLog } from '@/lib/ai/context-budget'
import { effortFor, resolveModel } from '@/lib/ai/models'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { htmlToPlainText } from '@/lib/communications'
import type { CoachingGoal } from '@/lib/supabase/types'
import { loadAssessmentStatusForChat, loadLatestAssessmentForChat } from './assessments'
import { loadActiveBrief } from './briefs'
import { loadCompanyContext } from './company'
import { composeChatSystemParts, composeWeeklyPlanParts, summariseAssessmentForPlanning, type SystemPromptParts } from './prompt'
import { formatPlansForPrompt, loadWeeklyPlans, weekStartFor } from './weekly-plan'
import { formatNotesForPrompt, loadNotesForChat } from './notes'
import type { PortalChatMode } from '@/lib/supabase/types'

// Model + effort: purpose `portal_chat` in lib/ai/models.ts (Opus 5, effort
// medium). Override with AI_MODEL_PORTAL_CHAT — PORTAL_CHAT_MODEL is ignored here.

/** Sent notes are short and dense — the coach's own summary of a session. */
const NOTES_CHAR_BUDGET = 8000
/** The client's own uploaded documents (kind 'general'), total and per document. */
const CLIENT_DOCS_CHAR_BUDGET = 16000
const CLIENT_DOC_CHARS = 8000

/** Text of the documents the client added to their own portal (never a 360 —
 *  that comes in structured — and never a personnel review, which is private
 *  reading, not chat material unless the client chooses to share it later). */
async function loadClientDocumentsForChat(clientId: string): Promise<Array<{ title: string; text: string }>> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('client_documents')
    .select('title, extracted_text')
    .eq('client_id', clientId)
    .eq('kind', 'general')
    .eq('extraction_status', 'complete')
    .order('created_at', { ascending: false })
    .limit(10)
  const out: Array<{ title: string; text: string }> = []
  let budget = CLIENT_DOCS_CHAR_BUDGET
  for (const d of data || []) {
    if (budget <= 0) break
    const full = (d.extracted_text || '').trim()
    const max = Math.min(CLIENT_DOC_CHARS, budget)
    const text = clip(full, max)
    if (!text) continue
    budget -= text.length
    // Say what was left out, so the assistant explains the clip instead of
    // reporting the document as "cut off". (A 360 never lands here — the
    // pipeline reads it structured, whatever kind the client picked.)
    const omitted = full.length - Math.min(full.length, max)
    out.push({
      title: d.title || 'Document',
      text: omitted > 0 ? `${text}\n[This document is longer than can be shown here — about ${omitted.toLocaleString('en-US')} more characters were not included. If they need the rest, it is in Your documents on their home page.]` : text,
    })
  }
  return out
}

export type ChatMsg = { role: 'user' | 'assistant'; content: string }

function clip(text: string, max: number): string {
  const t = (text || '').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

export type ChatContextMeta = {
  mode?: PortalChatMode
  brief_slug?: string
  brief_version?: number
  /** The general chat's coaching-conversation rubric (portal_chat brief), when active. */
  coaching_brief_version?: number
  assessment_document_id?: string
  has_comparison?: boolean
}

/** Who a portal call is billed to on the usage ledger (never request-supplied). */
export type ChatAttribution = { clientId: string; orgId: string | null; coachId: string | null }

export type ChatContextParts = SystemPromptParts & { clientName: string; meta: ChatContextMeta; attribution: ChatAttribution }

/**
 * Build the prompt PARTS for a client's chat: the cross-client prefix and this
 * client's snapshot (lib/portal/prompt.ts). The per-question excerpts and the
 * conversation history are added by lib/portal/context.ts#buildChatRequest,
 * which also fits everything to the slice budgets. `query` is unused here
 * today (retrieval moved to the request builder) and kept for the wrapper.
 */
export async function buildChatContextParts(
  clientId: string,
  _query?: string,
  mode: PortalChatMode = 'general'
): Promise<ChatContextParts> {
  const supabase = getSupabaseAdmin()

  const { data: client } = await supabase
    .from('clients')
    .select('id, org_id, name, coaching_goals, timezone, client_type')
    .eq('id', clientId)
    .maybeSingle()
  const clientName = client?.name || 'the client'
  // preferred_name (migration 061) — defensive separate read.
  const preferredName = await supabase
    .from('clients')
    .select('preferred_name')
    .eq('id', clientId)
    .maybeSingle()
    .then(
      (r) => (r.data?.preferred_name || '').trim() || null,
      () => null
    )
  const goals: CoachingGoal[] = Array.isArray(client?.coaching_goals)
    ? (client!.coaching_goals as CoachingGoal[])
    : []

  const [{ data: sentNotes }, { data: coachLinks }, assessment, company, clientDocuments, myNotes] = await Promise.all([
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
    loadClientDocumentsForChat(clientId).catch(() => []),
    loadNotesForChat(clientId).catch(() => []),
  ])
  const myNotesText = formatNotesForPrompt(myNotes)
  // A 360 on file but not surfaced (name mismatch, still reading, filed as an
  // other document, surfaces off) — the assistant says the true state.
  const assessmentStatus = assessment ? null : await loadAssessmentStatusForChat(clientId).catch(() => null)
  // Same rule as the home page: a portal participant's house-coach link is
  // structural, not a coaching relationship.
  const hasCoach = (coachLinks?.length ?? 0) > 0 && client?.client_type !== 'portal'
  // Ledger attribution: the client's org and (house) coach, from the records —
  // the request body never supplies these.
  const attribution: ChatAttribution = { clientId, orgId: client?.org_id ?? null, coachId: coachLinks?.[0]?.coach_id ?? null }
  const brief = assessment && client?.org_id ? await loadActiveBrief(client.org_id, 'assessment_360').catch(() => null) : null
  // The coaching-conversation rubric for the general chat (rubrics/02). Absent
  // row = the built-in preamble alone, exactly as before it existed.
  const coachingBrief =
    mode === 'general' && client?.org_id ? await loadActiveBrief(client.org_id, 'portal_chat').catch(() => null) : null

  // ── Plan your week: a different persona (the weekly_plan brief), a compact
  // development picture instead of the full report, and recent plans. ──
  if (mode === 'weekly_plan') {
    const [planBrief, plans] = await Promise.all([
      client?.org_id ? loadActiveBrief(client.org_id, 'weekly_plan').catch(() => null) : Promise.resolve(null),
      loadWeeklyPlans(clientId, 4),
    ])
    let notesBudget = 4000
    const planNoteParts: string[] = []
    for (const n of (sentNotes || []).slice(0, 3)) {
      if (notesBudget <= 0) break
      const chunk = clip(htmlToPlainText(n.body_html || ''), notesBudget)
      if (!chunk) continue
      notesBudget -= chunk.length
      const date = n.sent_at ? new Date(n.sent_at).toISOString().slice(0, 10) : ''
      planNoteParts.push(`## Notes${date ? ` — ${date}` : ''}${n.subject ? ` (${n.subject})` : ''}\n${chunk}`)
    }
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: client?.timezone || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    const parts = composeWeeklyPlanParts({
      clientName,
      preferredName,
      hasCoach,
      brief: planBrief ? { slug: planBrief.slug, version: planBrief.version, body: planBrief.body } : null,
      goals,
      assessmentSummary: assessment ? summariseAssessmentForPlanning(assessment.data) : null,
      assessmentStatus,
      clientDocuments,
      myNotes: myNotesText,
      recentPlans: formatPlansForPrompt(plans),
      noteParts: planNoteParts,
      today,
      weekStart: weekStartFor(new Date(), client?.timezone),
    })
    const meta: ChatContextMeta = { mode: 'weekly_plan' }
    if (planBrief) {
      meta.brief_slug = planBrief.slug
      meta.brief_version = planBrief.version
    }
    return { clientName, ...parts, meta, attribution }
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

  const parts = composeChatSystemParts({
    clientName,
    hasCoach,
    brief: brief ? { slug: brief.slug, version: brief.version, body: brief.body } : null,
    coachingBrief: coachingBrief ? { slug: coachingBrief.slug, version: coachingBrief.version, body: coachingBrief.body } : null,
    company: company ? { name: company.name, vision: company.vision, values: company.values, documents: company.documents } : null,
    clientDocuments,
    myNotes: myNotesText,
    assessment: assessment ? { data: assessment.data, assessmentCount: assessment.assessmentCount } : null,
    assessmentStatus,
    goals,
    noteParts,
    recentParts: [],
    retrievedParts: [],
  })

  const meta: ChatContextMeta = {}
  if (brief) {
    meta.brief_slug = brief.slug
    meta.brief_version = brief.version
  }
  if (coachingBrief) meta.coaching_brief_version = coachingBrief.version
  if (assessment) {
    meta.assessment_document_id = assessment.documentId
    meta.has_comparison = !!(assessment.data.comparison || assessment.data.reassessment)
  }

  return { clientName, ...parts, meta, attribution }
}

/** The parts joined as one string — for scripts and any caller that does not budget. */
export async function buildChatContext(
  clientId: string,
  query?: string,
  mode: PortalChatMode = 'general'
): Promise<{ clientName: string; system: string; meta: ChatContextMeta; attribution: ChatAttribution }> {
  const parts = await buildChatContextParts(clientId, query, mode)
  return { clientName: parts.clientName, system: [parts.prefix, parts.snapshot, parts.tail].filter(Boolean).join('\n\n'), meta: parts.meta, attribution: parts.attribution }
}

/** Output cap INCLUDING thinking (brief: 4,000). */
const MAX_TOKENS = CONTEXT_BUDGET.MAX_OUTPUT_TOKENS

/**
 * `degraded` = the client is past their soft cap this month (Phase 2): the
 * call is routed to `portal_degraded` (the cheaper model) and the ledger row
 * says so. The prompt, context, and everything else are identical.
 */
export type ChatReplyOpts = { degraded?: boolean; slices?: SliceLog }

function chatCallMeta(attribution: ChatAttribution, mode: PortalChatMode, opts: ChatReplyOpts = {}) {
  const degraded = !!opts.degraded
  return {
    purpose: 'portal_chat' as const,
    feature: `portal_chat:${mode}`,
    principal: 'client' as const,
    orgId: attribution.orgId,
    coachId: attribution.coachId,
    clientId: attribution.clientId,
    ...(degraded ? { model: resolveModel('portal_degraded'), effort: effortFor('portal_degraded', resolveModel('portal_degraded')) } : {}),
    metadata: { mode, ...(degraded ? { degraded: true } : {}), ...(opts.slices ? { slices: opts.slices } : {}) },
  }
}

/**
 * Stream the assistant's reply. Yields text deltas as they arrive so the portal
 * can render progressively instead of showing a spinner for the whole call.
 */
export async function* streamChatReply(
  system: string | AiTextBlock[],
  messages: ChatMsg[],
  attribution: ChatAttribution,
  mode: PortalChatMode = 'general',
  opts: ChatReplyOpts = {}
): AsyncGenerator<string, void, unknown> {
  if (!isAiConfigured()) throw new Error('ANTHROPIC_API_KEY is not configured.')
  const stream = await aiStream(chatCallMeta(attribution, mode, opts), {
    max_tokens: MAX_TOKENS,
    max_tokens_includes_thinking: true,
    system,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    timeoutMs: 120_000,
  })
  try {
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text
      }
    }
  } finally {
    // Settle the ledger row before the serverless function is allowed to return.
    await ledgerDone(stream)
  }
}

/** Non-streaming reply. Returns '' on failure (caller handles). */
export async function generateChatReply(
  system: string | AiTextBlock[],
  messages: ChatMsg[],
  attribution: ChatAttribution,
  mode: PortalChatMode = 'general',
  opts: ChatReplyOpts = {}
): Promise<string> {
  if (!isAiConfigured()) throw new Error('ANTHROPIC_API_KEY is not configured.')
  const message = await aiCreate(chatCallMeta(attribution, mode, opts), {
    max_tokens: MAX_TOKENS,
    max_tokens_includes_thinking: true,
    system,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    timeoutMs: 120_000,
  })
  return textOf(message)
}
