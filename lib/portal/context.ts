/**
 * Portal chat request builder (cost-controls brief, Phase 3).
 *
 * Turns the client's material into ONE request shaped for the budgeter
 * (lib/ai/context-budget.ts) and the prompt cache:
 *
 *   system = [ prefix   {cache 1h}   cross-client: preamble, standards, briefs, company
 *              snapshot {cache 5m}   this client's goals / 360 / documents / notes
 *              tail     (no cache)   history summary + excerpts for THIS question ]
 *   messages = the last turns verbatim + the current message (+ a fitted upload)
 *
 * Every loader is scoped by the session clientId — the request body never
 * names a client — and NEVER reads key_info or the coach-private `notes`
 * table. Full transcripts are never sent: only the newest sessions' openings
 * and the passages `portal_chat_context` ranks against the question.
 *
 * Older turns are summarised once by a light background model and the
 * summary is persisted on the conversation (migration 071) so the same turns
 * are never re-summarised; pre-071 the summary simply is not kept and the
 * older turns ride verbatim as far as the history budget allows.
 */
import { aiCountTokens, aiCreate, textOf, type AiTextBlock } from '@/lib/ai/client'
import { CONTEXT_BUDGET, assembleContext, fitAttachment, type HistoryMessage, type SliceLog } from '@/lib/ai/context-budget'
import { resolveModel } from '@/lib/ai/models'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import type { PortalChatMode } from '@/lib/supabase/types'
import type { ChatAttribution, ChatContextMeta } from './chat'
import { buildChatContextParts } from './chat'

export type TextBlock = AiTextBlock

/** A stored turn of the conversation, oldest first. */
export type StoredMessage = { role: 'user' | 'assistant'; content: string }

export type ChatRequest = {
  clientName: string
  /** Cache-controlled system blocks: prefix (1h), snapshot (5m), tail (none). */
  system: TextBlock[]
  /** History (verbatim window) + the current message, ready for the API. */
  messages: HistoryMessage[]
  meta: ChatContextMeta
  attribution: ChatAttribution
  /** Per-slice token figures for the ledger row (`ai_usage.metadata.slices`). */
  slices: SliceLog
  /** A client-facing note when the upload had to be trimmed (X-Context-Note). */
  note: string | null
}

/** The newest sessions whose OPENING is always offered (never the full transcript). */
export const RECENT_OPENING_COUNT = 2
export const RECENT_OPENING_CHARS = 2500
/** How many ranked passages to ask the retrieval function for. */
export const RETRIEVAL_LIMIT = 12
/** Compact once this many older turns sit outside the summary. */
export const SUMMARY_BATCH = 4
const SUMMARY_MAX_TOKENS = 600

function clip(text: string, max: number): string {
  const t = (text || '').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

/**
 * Excerpts for this question, most relevant first: the newest sessions'
 * openings, then the passages ranked against the question from the whole
 * history (sessions + the notes the coach sent). Each item is whole — the
 * budgeter drops from the end.
 */
export async function loadExcerpts(clientId: string, query: string): Promise<string[]> {
  const supabase = getSupabaseAdmin()
  const out: string[] = []
  const { data: recent } = await supabase
    .from('transcripts')
    .select('id, title, session_date, raw_md')
    .eq('client_id', clientId)
    .order('session_date', { ascending: false, nullsFirst: false })
    .limit(RECENT_OPENING_COUNT)
  const recentIds = new Set<string>()
  for (const t of recent ?? []) {
    recentIds.add(t.id)
    const body = clip(t.raw_md || '', RECENT_OPENING_CHARS)
    if (!body) continue
    out.push(`## Session${t.session_date ? ` — ${t.session_date}` : ''}${t.title ? ` (${t.title})` : ''} — opening\n${body}`)
  }
  const q = (query || '').trim()
  if (q.length >= 2) {
    try {
      const { data: hits, error } = await supabase.rpc('portal_chat_context', { p_client_id: clientId, p_query: q, p_limit: RETRIEVAL_LIMIT })
      if (error) throw new Error(error.message)
      for (const hit of hits ?? []) {
        const excerpt = (hit.excerpt || '').trim()
        if (!excerpt) continue
        const label = hit.kind === 'note' ? 'Notes' : 'Session'
        out.push(`## ${label}${hit.occurred_on ? ` — ${hit.occurred_on}` : ''} (${hit.title})${hit.kind === 'session' && recentIds.has(hit.id) ? ' — later passage' : ''}\n${excerpt}`)
      }
    } catch (e) {
      // Migration 053 not applied, or no lexemes in the question: openings only.
      console.error('portal_chat_context unavailable:', e)
    }
  }
  return out
}

export type SummaryState = { summary: string; through: number; /** false pre-071: no columns to keep a summary in. */ available: boolean }

/**
 * The persisted summary state. Pre-071 (no columns) it is UNAVAILABLE and no
 * summary is written: older turns then ride verbatim as far as the history
 * budget allows and the rest are dropped — never a background call per
 * message whose result cannot be kept.
 */
export async function loadSummaryState(conversationId: string): Promise<SummaryState> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('portal_conversations')
    .select('history_summary, history_summary_through')
    .eq('id', conversationId)
    .maybeSingle()
  if (error) {
    console.warn('[portal/context] history summary unavailable (migration 071?):', error.message)
    return { summary: '', through: 0, available: false }
  }
  if (!data) return { summary: '', through: 0, available: true }
  return { summary: (data.history_summary || '').trim(), through: Math.max(0, data.history_summary_through ?? 0), available: true }
}

/**
 * Split the thread: the last VERBATIM_MESSAGES turns (before the current one)
 * ride verbatim; anything older is covered by the running summary. When ≥
 * SUMMARY_BATCH older turns are not yet covered, one light background call
 * folds them in and the result is persisted. On any failure the uncovered
 * turns stay verbatim (the budgeter keeps the newest that fit) — nothing is
 * silently lost, and the same turns are never summarised twice.
 */
export async function prepareHistory(
  conversationId: string,
  all: StoredMessage[],
  state: SummaryState,
  attribution: ChatAttribution
): Promise<{ summary: string; history: HistoryMessage[] }> {
  // `all` excludes the current (just-inserted) message.
  const verbatimStart = Math.max(0, all.length - CONTEXT_BUDGET.VERBATIM_MESSAGES)
  let through = Math.min(state.through, verbatimStart)
  let summary = through > 0 ? state.summary : ''
  const uncovered = verbatimStart - through
  if (state.available && uncovered >= SUMMARY_BATCH) {
    const batch = all.slice(through, verbatimStart)
    try {
      const message = await aiCreate(
        {
          purpose: 'background_compact',
          feature: 'portal_chat:summary',
          principal: 'client',
          orgId: attribution.orgId,
          coachId: attribution.coachId,
          clientId: attribution.clientId,
          metadata: { conversation_id: conversationId, turns: batch.length },
        },
        {
          max_tokens: SUMMARY_MAX_TOKENS,
          system:
            'You keep a running memory of a coaching reflection conversation for the assistant that takes part in it. Write a compact summary in the third person ("they raised…", "the assistant asked…"): what the person brought, what they concluded or decided, open threads, anything they committed to, and any facts about their situation they stated. Under 250 words. Plain prose, no headings, no advice, nothing not in the turns.',
          messages: [
            {
              role: 'user',
              content: `${summary ? `SUMMARY SO FAR:\n${summary}\n\n` : ''}TURNS TO FOLD IN:\n${batch.map((m) => `${m.role === 'user' ? 'Person' : 'Assistant'}: ${m.content}`).join('\n\n')}\n\nWrite the updated summary.`,
            },
          ],
          timeoutMs: 30_000,
        }
      )
      const next = textOf(message)
      if (next) {
        summary = next
        through = verbatimStart
        const supabase = getSupabaseAdmin()
        const { error } = await supabase
          .from('portal_conversations')
          .update({ history_summary: summary, history_summary_through: through, history_summary_at: new Date().toISOString() })
          .eq('id', conversationId)
        if (error) console.warn('[portal/context] summary not persisted (migration 071?):', error.message)
      }
    } catch (e) {
      console.error('[portal/context] history summary failed; older turns ride verbatim:', e)
    }
  }
  const history = all.slice(through)
  // The API wants the first turn from the person; a window that opens on an
  // assistant turn (parity of the cut) drops that turn — the summary covers it.
  while (history.length && history[0].role === 'assistant') history.shift()
  return { summary, history }
}

/** The one place the cache markers are set. Prefix 1 h, snapshot 5 m, tail none. */
export function systemBlocks(prefix: string, snapshot: string, tail: string): TextBlock[] {
  const blocks: TextBlock[] = [{ type: 'text', text: prefix, cache_control: { type: 'ephemeral', ttl: '1h' } }]
  if (snapshot) blocks.push({ type: 'text', text: snapshot, cache_control: { type: 'ephemeral' } })
  if (tail) blocks.push({ type: 'text', text: tail })
  return blocks
}

export type BuildChatRequestInput = {
  clientId: string
  conversationId: string
  mode: PortalChatMode
  /** The current message as typed. */
  content: string
  attachment: { filename: string; text: string } | null
  /** Every stored turn of the thread, oldest first, INCLUDING the just-inserted current one. */
  stored: StoredMessage[]
  /** Which model will answer (drives the tokenizer estimate + the count). */
  model?: string
}

/**
 * Assemble the request: load the parts, fit them to the slice budgets, verify
 * the total with count_tokens and re-fit (up to twice) if the measured total
 * is over the ceiling. Drop order under the ceiling: excerpts → history →
 * snapshot; the system prefix is never dropped.
 */
export async function buildChatRequest(input: BuildChatRequestInput): Promise<ChatRequest> {
  const model = input.model ?? resolveModel('portal_chat')
  const [parts, state] = await Promise.all([
    buildChatContextParts(input.clientId, input.content, input.mode),
    loadSummaryState(input.conversationId),
  ])
  const excerpts = input.mode === 'general' ? await loadExcerpts(input.clientId, input.content) : []
  // The current message is the last stored one; everything before it is history.
  const prior = input.stored.slice(0, Math.max(0, input.stored.length - 1))
  const { summary, history } = await prepareHistory(input.conversationId, prior, state, parts.attribution)

  const fitted = fitAttachment(input.content, input.attachment, model)
  const current = fitted.text
    ? `${input.content}\n\n[Attached document "${input.attachment!.filename}"${fitted.note ? ' — only the first part is included' : ''}]:\n${fitted.text}`
    : input.content

  const base = {
    model,
    system: parts.prefix,
    snapshot: parts.snapshot,
    memory: '',
    excerpts,
    historySummary: summary,
    history,
    current,
  }
  const toMessages = (h: HistoryMessage[], current: string): HistoryMessage[] => {
    const kept = [...h]
    while (kept.length && kept[0].role === 'assistant') kept.shift()
    return [...kept, { role: 'user', content: current }]
  }
  let out = assembleContext(base)
  let system = systemBlocks(out.system, out.snapshot, [parts.tail, out.tail].filter(Boolean).join('\n\n'))
  let messages = toMessages(out.history, out.current)

  // Verify with the real tokenizer; tighten the variable slices and re-fit if over.
  for (let round = 0; round < 2; round++) {
    const counted = await aiCountTokens(model, { system, messages })
    out.log.measured = counted.tokens
    if (counted.tokens <= CONTEXT_BUDGET.CEILING) break
    const scale = (CONTEXT_BUDGET.CEILING / counted.tokens) * 0.95
    const tighter = {
      ...CONTEXT_BUDGET,
      SNAPSHOT: Math.floor(out.log.snapshot.tokens * scale),
      EXCERPTS: Math.floor(out.log.excerpts.tokens * scale),
      HISTORY: Math.floor(out.log.history.tokens * scale),
    }
    const prev = out.log.measured
    out = assembleContext(base, tighter)
    out.log.measured = prev
    system = systemBlocks(out.system, out.snapshot, [parts.tail, out.tail].filter(Boolean).join('\n\n'))
    messages = toMessages(out.history, out.current)
  }

  return {
    clientName: parts.clientName,
    system,
    messages,
    meta: parts.meta,
    attribution: parts.attribution,
    slices: out.log,
    note: fitted.note,
  }
}
