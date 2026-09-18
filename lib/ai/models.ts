/**
 * THE ONLY PLACE MODEL IDS LIVE.
 *
 * Every Anthropic call in the app is keyed by a `purpose`; the purpose decides
 * the model (and, for the portal, the effort level). Nothing outside lib/ai/
 * may name a model id or read a model env var — `scripts/check-ai-imports.sh`
 * fails the build on a direct SDK import elsewhere.
 *
 * Overrides: `AI_MODEL_<PURPOSE>` (upper-cased purpose, e.g.
 * AI_MODEL_PORTAL_CHAT). The pre-Phase-1 env vars (SCORING_MODEL, GENERATE_MODEL,
 * …) are still honoured as legacy fallbacks for the coach-side purposes they
 * used to configure, with a deprecation warning, so a value already set in
 * Vercel keeps working. PORTAL_CHAT_MODEL is deliberately NOT honoured for
 * `portal_chat` — the brief moves the portal to Opus 5 and a stale override must
 * not quietly undo that (it still applies to the weekly-plan extraction, which
 * it also configured).
 *
 * Retired ids: an override that names a retired model is ignored with a warning
 * and the purpose's default is used (the pre-Phase-1 behaviour of the three
 * copies of this guard, now in one place). A retired DEFAULT is a code bug and
 * throws — nothing here may silently substitute a different model for a
 * purpose Jeff has not configured.
 *
 * Prices are NOT here — they are data (`ai_model_prices`, lib/ai/pricing.ts).
 */

export type AiPurpose =
  // Client Portal (client principal)
  | 'portal_chat' // the reflection chat + weekly-plan chat — Opus 5 (quality is the product)
  | 'portal_degraded' // Sonnet 5; used ONLY at a soft cap (Phase 2), never by default
  | 'portal_weekly_plan_extract' // Top-5 extraction from a planning thread
  // Background work (system principal): summaries, titles, extraction
  | 'background_compact'
  | 'transcript_title'
  // Coach-side features — keep today's models (moved here, not changed)
  | 'scoring'
  | 'scoring_suggest'
  | 'growth_pass'
  | 'growth_bands'
  | 'nudge_extract'
  | 'nudge_draft'
  | 'note_narrative'
  | 'note_client_email'
  | 'session_prep'
  | 'goals_generate'
  | 'plan_session'

export type AiEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/**
 * Tokenizer generation. Models from Opus 4.7 on (Opus 5, Sonnet 5) tokenize
 * the same text into ~30% more tokens than Sonnet 4.6 / Haiku 4.5. Used only by
 * the character-based estimator; real counts come from count_tokens.
 */
export type TokenizerGeneration = 'v1' | 'v2'

export type ModelInfo = {
  tokenizer: TokenizerGeneration
  /** Whether `output_config.effort` is accepted (Haiku 4.5 rejects it). */
  effort: boolean
  /** Minimum cacheable prefix in tokens (shorter prefixes silently don't cache). */
  minCachePrefixTokens: number
  contextWindow: number
  maxOutput: number
}

/** Models the gateway knows how to price and configure. Anything else is refused. */
export const KNOWN_MODELS: Record<string, ModelInfo> = {
  'claude-opus-5': { tokenizer: 'v2', effort: true, minCachePrefixTokens: 512, contextWindow: 1_000_000, maxOutput: 128_000 },
  'claude-sonnet-5': { tokenizer: 'v2', effort: true, minCachePrefixTokens: 1024, contextWindow: 1_000_000, maxOutput: 128_000 },
  'claude-opus-4-8': { tokenizer: 'v2', effort: true, minCachePrefixTokens: 1024, contextWindow: 1_000_000, maxOutput: 128_000 },
  'claude-sonnet-4-6': { tokenizer: 'v1', effort: true, minCachePrefixTokens: 1024, contextWindow: 1_000_000, maxOutput: 128_000 },
  'claude-haiku-4-5-20251001': { tokenizer: 'v1', effort: false, minCachePrefixTokens: 4096, contextWindow: 200_000, maxOutput: 64_000 },
  'claude-haiku-4-5': { tokenizer: 'v1', effort: false, minCachePrefixTokens: 4096, contextWindow: 200_000, maxOutput: 64_000 },
}

/** Ids that have retired — calling them 404s. Union of the three old per-file sets. */
export const RETIRED_MODELS: ReadonlySet<string> = new Set([
  'claude-sonnet-4-20250514',
  'claude-3-5-sonnet-20240620',
  'claude-3-5-sonnet-20241022',
  'claude-3-opus-20240229',
  'claude-3-haiku-20240307',
])

const SONNET_TODAY = 'claude-sonnet-4-6'

/**
 * Defaults per purpose. Coach-side purposes keep the exact models they ran on
 * before Phase 1 (brief: "existing features → keep current models"). Only the
 * three brief-mandated slots differ from the old per-file defaults.
 */
export const DEFAULT_MODELS: Record<AiPurpose, string> = {
  portal_chat: 'claude-opus-5',
  portal_degraded: 'claude-sonnet-5',
  background_compact: 'claude-haiku-4-5-20251001',
  transcript_title: 'claude-haiku-4-5-20251001',
  portal_weekly_plan_extract: SONNET_TODAY,
  scoring: SONNET_TODAY,
  scoring_suggest: SONNET_TODAY,
  growth_pass: SONNET_TODAY,
  growth_bands: SONNET_TODAY,
  nudge_extract: SONNET_TODAY,
  nudge_draft: SONNET_TODAY,
  note_narrative: SONNET_TODAY,
  note_client_email: SONNET_TODAY,
  session_prep: SONNET_TODAY,
  goals_generate: SONNET_TODAY,
  plan_session: SONNET_TODAY,
}

/**
 * Effort per purpose. Only the portal sets one today: Opus 5 runs adaptive
 * thinking by default and thinking tokens count inside `max_tokens`, so an
 * unbounded `high` (the API default) could spend the whole 4096 budget before
 * the reply — `medium` is the brief's Phase 3 starting point, applied now so the
 * model switch is not a regression. Everything else omits the parameter (= the
 * API default, byte-identical to before). Kept constant per conversation: a
 * changed top-level effort invalidates the prompt cache.
 */
export const PURPOSE_EFFORT: Partial<Record<AiPurpose, AiEffort>> = {
  portal_chat: 'medium',
  portal_degraded: 'medium',
}

/** Pre-Phase-1 env vars, in the precedence each purpose used to apply. */
const LEGACY_ENV: Partial<Record<AiPurpose, string[]>> = {
  scoring: ['SCORING_MODEL'],
  scoring_suggest: ['SUGGEST_MODEL', 'SCORING_MODEL'],
  growth_pass: ['SUGGEST_MODEL', 'SCORING_MODEL'],
  growth_bands: ['SUGGEST_MODEL', 'SCORING_MODEL'],
  nudge_extract: ['NUDGE_MODEL'],
  nudge_draft: ['NUDGE_MODEL'],
  transcript_title: ['TITLE_MODEL'],
  note_narrative: ['GENERATE_MODEL'],
  note_client_email: ['GENERATE_MODEL'],
  session_prep: ['GENERATE_MODEL'],
  goals_generate: ['GOALS_MODEL'],
  plan_session: ['PLAN_SESSION_MODEL'],
  portal_weekly_plan_extract: ['PORTAL_CHAT_MODEL'],
}

const warned = new Set<string>()
function warnOnce(key: string, message: string) {
  if (warned.has(key)) return
  warned.add(key)
  console.warn(message)
}

export function envKeyFor(purpose: AiPurpose): string {
  return `AI_MODEL_${purpose.toUpperCase()}`
}

/**
 * Resolve the model id for a purpose: AI_MODEL_<PURPOSE> → legacy env → default.
 * An override naming a retired or unknown model is ignored (warned once).
 */
export function resolveModel(purpose: AiPurpose): string {
  const fallback = DEFAULT_MODELS[purpose]
  if (!fallback) throw new Error(`Unknown AI purpose "${purpose}".`)
  if (RETIRED_MODELS.has(fallback) || !KNOWN_MODELS[fallback]) {
    // A default must always be a live, priced model — this is a code bug, not config.
    throw new Error(`Default model for "${purpose}" (${fallback}) is retired or unknown — update lib/ai/models.ts.`)
  }

  const candidates: Array<{ key: string; value: string | undefined; legacy: boolean }> = [
    { key: envKeyFor(purpose), value: process.env[envKeyFor(purpose)], legacy: false },
    ...(LEGACY_ENV[purpose] ?? []).map((key) => ({ key, value: process.env[key], legacy: true })),
  ]
  for (const c of candidates) {
    const value = c.value?.trim()
    if (!value) continue
    if (RETIRED_MODELS.has(value)) {
      warnOnce(`${c.key}:${value}`, `${c.key}="${value}" is retired; using ${fallback} for ${purpose}. Update the env var to a current model id.`)
      continue
    }
    if (!KNOWN_MODELS[value]) {
      warnOnce(`${c.key}:${value}`, `${c.key}="${value}" is not a model the AI gateway knows (no price/config); using ${fallback} for ${purpose}. Add it to lib/ai/models.ts + ai_model_prices first.`)
      continue
    }
    if (c.legacy) {
      warnOnce(`legacy:${c.key}`, `${c.key} is deprecated — set ${envKeyFor(purpose)} instead (still honoured for ${purpose}).`)
    }
    return value
  }
  if (purpose === 'portal_chat' && process.env.PORTAL_CHAT_MODEL?.trim()) {
    warnOnce('portal_chat:legacy', `PORTAL_CHAT_MODEL is ignored for portal_chat since Phase 1 (Opus 5 by design); set ${envKeyFor('portal_chat')} to override.`)
  }
  return fallback
}

export function modelInfo(model: string): ModelInfo | null {
  return KNOWN_MODELS[model] ?? null
}

/** Effort to send for a purpose, or undefined to leave the API default. */
export function effortFor(purpose: AiPurpose, model: string): AiEffort | undefined {
  const effort = PURPOSE_EFFORT[purpose]
  if (!effort) return undefined
  return modelInfo(model)?.effort ? effort : undefined
}

/**
 * Character-based token ESTIMATE for a model's tokenizer — the pre-call
 * worst-case reservation and the count_tokens fallback. Calibrated
 * conservatively (over-estimates): English prose runs ~4.0 chars/token on the
 * v1 tokenizer and ~3.1 on v2. Real counts come from `aiCountTokens`.
 */
export function estimateTokens(chars: number, model: string): number {
  const gen = modelInfo(model)?.tokenizer ?? 'v2'
  const perToken = gen === 'v2' ? 3.1 : 4.0
  return Math.ceil(Math.max(0, chars) / perToken)
}
