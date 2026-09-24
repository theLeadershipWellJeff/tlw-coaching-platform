/**
 * Context budgeter for the portal chat (cost-controls brief, Phase 3).
 *
 * Every request is assembled from FIXED SLICES, stable first so the prefix
 * caches, each with its own token budget, under one HARD CEILING. Pure and
 * dependency-free: the loaders in lib/portal/context.ts produce slice text,
 * this module fits it. Token figures here are the character-based estimate
 * (`estimateTokens`, per tokenizer); the caller verifies the final request
 * with `count_tokens` and re-fits if the measured total is over.
 *
 *   1. system    ≤ SYSTEM     cached (1h)   preamble + standards + briefs + company
 *   2. snapshot  ≤ SNAPSHOT   cached (5m)   the client's goals / 360 / docs / notes
 *   3. memory    ≤ MEMORY     reserved      empty until the memory build
 *   4. excerpts  ≤ EXCERPTS   uncached      retrieved passages for THIS question
 *   5. history   ≤ HISTORY    messages      last turns verbatim + a summary of older
 *   6. current   ≤ CURRENT    messages      the message + a trimmed upload
 *
 * Over the ceiling → drop from the lowest-priority slice first:
 * excerpts → history → snapshot. The system slice is never dropped.
 */
import { estimateTokens } from './models'

export const CONTEXT_BUDGET = {
  /** Hard ceiling on input tokens for one portal request (brief). */
  CEILING: 40_000,
  /**
   * The brief's 3k target covers the preamble alone; the practice's briefs
   * (rubrics/02, and the ~6k-token 360 interpretation brief when a report is
   * on file) live in this slice too, so it is sized to hold them. It is the
   * cross-client cached prefix — read at 0.1× after the first turn.
   */
  SYSTEM: 12_000,
  /**
   * This client: the 360 as compact text (~3.5k), its verbatim comments, the
   * full Strength Builder entries for its candidates (~3–4k), goals, their
   * documents and notes. Raised from 6k on 2026-09-24: the raw-JSON 360 alone
   * measured ~14.5k tokens by this estimator, so the clip silently dropped
   * the report's second half (candidates, comments, goals, notes). The
   * compact rendering is 6–7k, the three builder entries ~5k; 14k holds both
   * with the client's own material, which the snapshot orders FIRST (vendor
   * text is last, so an overflow clips it before anything the client wrote).
   * Cached 5m, so a live debrief pays for it once per five minutes.
   */
  SNAPSHOT: 14_000,
  MEMORY: 2_000,
  EXCERPTS: 10_000,
  HISTORY: 6_000,
  CURRENT: 6_000,
  /** Output cap for the reply, thinking included (brief: 4,000). */
  MAX_OUTPUT_TOKENS: 4_000,
  /** Turns kept verbatim; older turns are summarised. */
  VERBATIM_MESSAGES: 6,
} as const

export type ContextBudget = { readonly [K in keyof typeof CONTEXT_BUDGET]: number }

export type SliceName = 'system' | 'snapshot' | 'memory' | 'excerpts' | 'history' | 'current'

export type SliceLog = Record<SliceName, { tokens: number; budget: number; clipped: boolean; dropped: boolean }> & {
  total: number
  ceiling: number
  measured?: number
  drops: SliceName[]
}

export type HistoryMessage = { role: 'user' | 'assistant'; content: string }

export type ContextInput = {
  model: string
  system: string
  snapshot: string
  /** Reserved. Always '' today. */
  memory?: string
  /** Ordered most-relevant first; each item is dropped whole, last first, when over budget. */
  excerpts: string[]
  /** Summary of turns older than the verbatim window ('' when none). Rides in the uncached tail. */
  historySummary: string
  /** Verbatim turns, oldest first, WITHOUT the current message. */
  history: HistoryMessage[]
  /** The current user message (already has the fitted upload spliced in). */
  current: string
}

export type ContextOutput = {
  system: string
  snapshot: string
  /** Everything that must NOT be cached: excerpts + the history summary. */
  tail: string
  history: HistoryMessage[]
  current: string
  log: SliceLog
}

/** Clip text to about `maxTokens` for `model` (character-based). '' stays ''. */
export function clipToTokens(text: string, maxTokens: number, model: string): { text: string; clipped: boolean } {
  const t = text || ''
  if (!t) return { text: '', clipped: false }
  if (maxTokens <= 0) return { text: '', clipped: true }
  if (estimateTokens(t.length, model) <= maxTokens) return { text: t, clipped: false }
  // chars per token for this tokenizer, derived from the estimator itself
  const perToken = t.length / Math.max(1, estimateTokens(t.length, model))
  const keep = Math.max(0, Math.floor(maxTokens * perToken) - 1)
  return { text: `${t.slice(0, keep).trimEnd()}…`, clipped: true }
}

/**
 * Fit an upload next to the message within the CURRENT budget. Returns the
 * trimmed attachment text and a client-facing note when anything was cut.
 */
export function fitAttachment(
  message: string,
  attachment: { filename: string; text: string } | null,
  model: string,
  budget = CONTEXT_BUDGET.CURRENT
): { text: string | null; note: string | null; omittedChars: number } {
  if (!attachment || !attachment.text.trim()) return { text: null, note: null, omittedChars: 0 }
  const overhead = estimateTokens(message.length + attachment.filename.length + 80, model)
  const room = Math.max(0, budget - overhead)
  const { text, clipped } = clipToTokens(attachment.text, room, model)
  if (!clipped) return { text, note: null, omittedChars: 0 }
  const omitted = attachment.text.length - text.length
  return {
    text,
    note: `Only the first part of "${attachment.filename}" could be included (about ${omitted.toLocaleString('en-US')} characters were left out).`,
    omittedChars: omitted,
  }
}

function tok(text: string, model: string): number {
  return text ? estimateTokens(text.length, model) : 0
}

/**
 * Assemble a request within the budgets. Per-slice clipping first, then the
 * ceiling with the brief's drop order (excerpts → history → snapshot).
 */
export function assembleContext(input: ContextInput, budget: ContextBudget = CONTEXT_BUDGET): ContextOutput {
  const m = input.model
  const drops: SliceName[] = []
  const flags: Record<SliceName, { clipped: boolean; dropped: boolean }> = {
    system: { clipped: false, dropped: false },
    snapshot: { clipped: false, dropped: false },
    memory: { clipped: false, dropped: false },
    excerpts: { clipped: false, dropped: false },
    history: { clipped: false, dropped: false },
    current: { clipped: false, dropped: false },
  }

  // 1. system — never dropped; clipped only as a last resort (should not happen)
  const sys = clipToTokens(input.system, budget.SYSTEM, m)
  flags.system.clipped = sys.clipped
  // 2. snapshot
  let snap = clipToTokens(input.snapshot, budget.SNAPSHOT, m)
  flags.snapshot.clipped = snap.clipped
  // 3. memory (reserved)
  const mem = clipToTokens(input.memory || '', budget.MEMORY, m)
  // 4. excerpts — whole items, most relevant first, until the budget is full
  let excerpts: string[] = []
  {
    let used = 0
    for (const e of input.excerpts) {
      const t = tok(e, m)
      if (used + t > budget.EXCERPTS) {
        flags.excerpts.clipped = true
        continue
      }
      excerpts.push(e)
      used += t
    }
  }
  // 5. history — the summary first (small), then verbatim turns newest-first until the budget is full
  const summary = clipToTokens(input.historySummary, Math.floor(budget.HISTORY / 3), m)
  let history: HistoryMessage[] = []
  {
    let used = tok(summary.text, m)
    const kept: HistoryMessage[] = []
    for (let i = input.history.length - 1; i >= 0; i--) {
      const t = tok(input.history[i].content, m)
      if (used + t > budget.HISTORY) {
        flags.history.clipped = true
        break
      }
      kept.unshift(input.history[i])
      used += t
    }
    history = kept
  }
  // 6. current — clipped, never dropped
  const cur = clipToTokens(input.current, budget.CURRENT, m)
  flags.current.clipped = cur.clipped

  const total = () =>
    tok(sys.text, m) + tok(snap.text, m) + tok(mem.text, m) + excerpts.reduce((a, e) => a + tok(e, m), 0) + tok(summary.text, m) + history.reduce((a, h) => a + tok(h.content, m), 0) + tok(cur.text, m)

  // Ceiling: excerpts → history → snapshot
  if (total() > budget.CEILING && excerpts.length) {
    while (total() > budget.CEILING && excerpts.length) excerpts.pop()
    flags.excerpts.clipped = true
    if (!excerpts.length) {
      flags.excerpts.dropped = true
      drops.push('excerpts')
    }
  }
  if (total() > budget.CEILING && history.length) {
    while (total() > budget.CEILING && history.length) history.shift()
    flags.history.clipped = true
    if (!history.length) {
      flags.history.dropped = true
      drops.push('history')
    }
  }
  if (total() > budget.CEILING && snap.text) {
    const room = Math.max(0, budget.CEILING - (total() - tok(snap.text, m)))
    snap = clipToTokens(snap.text, room, m)
    flags.snapshot.clipped = true
    if (!snap.text) {
      flags.snapshot.dropped = true
      drops.push('snapshot')
    }
  }

  const tailParts: string[] = []
  if (mem.text) tailParts.push(mem.text)
  if (summary.text) tailParts.push(`EARLIER IN THIS CONVERSATION (summary of the turns not shown below):\n${summary.text}`)
  if (excerpts.length) tailParts.push(`EARLIER SESSIONS AND NOTES RELEVANT TO THIS QUESTION (excerpts — a relevant selection, not their complete history):\n${excerpts.join('\n\n')}`)

  const log: SliceLog = {
    system: { tokens: tok(sys.text, m), budget: budget.SYSTEM, ...flags.system },
    snapshot: { tokens: tok(snap.text, m), budget: budget.SNAPSHOT, ...flags.snapshot },
    memory: { tokens: tok(mem.text, m), budget: budget.MEMORY, ...flags.memory },
    excerpts: { tokens: excerpts.reduce((a, e) => a + tok(e, m), 0), budget: budget.EXCERPTS, ...flags.excerpts },
    history: { tokens: tok(summary.text, m) + history.reduce((a, h) => a + tok(h.content, m), 0), budget: budget.HISTORY, ...flags.history },
    current: { tokens: tok(cur.text, m), budget: budget.CURRENT, ...flags.current },
    total: total(),
    ceiling: budget.CEILING,
    drops,
  }
  return { system: sys.text, snapshot: snap.text, tail: tailParts.join('\n\n'), history, current: cur.text, log }
}
