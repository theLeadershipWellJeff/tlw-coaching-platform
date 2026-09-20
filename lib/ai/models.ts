/**
 * THE ONLY PLACE MODEL IDS LIVE — and the routing policy that picks one.
 *
 * No purpose hard-codes a model. Each purpose declares a TASK PROFILE (how
 * much reasoning the problem needs, who reads the output, whether someone is
 * waiting) and `routeModel` picks, deterministically, the CHEAPEST and FASTEST
 * model in the catalog whose capability meets the profile. Change the catalog
 * (a new model, a retirement, a price shift that changes the cost rank) and
 * every purpose re-routes; nothing else in the app names a model.
 *
 * Overrides: `AI_MODEL_<PURPOSE>` (upper-cased purpose, e.g.
 * AI_MODEL_PORTAL_CHAT) pins a purpose to a model. The pre-Phase-1 env vars
 * (SCORING_MODEL, GENERATE_MODEL, …, PORTAL_CHAT_MODEL) are RETIRED since
 * Phase 4 (2026-09-19): still set, they are ignored with one warning naming
 * the AI_MODEL_<PURPOSE> key to use instead — a stale override can never
 * quietly pin a purpose off its routed model.
 *
 * Retired ids: an override naming a retired model is ignored with a warning
 * and the routed model is used. A routed model that is retired or unpriced is
 * a catalog bug and throws — nothing here silently substitutes.
 *
 * Prices are NOT here — they are data (`ai_model_prices`, lib/ai/pricing.ts).
 * The catalog carries a cost RANK (from those prices) so routing can compare
 * without duplicating dollar figures; keep the rank in step when prices move.
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

/** How much reasoning a task needs — the axis routing keys on. */
export type Capability = 1 | 2 | 3 // 1 = light (extraction, titles), 2 = strong (judgment, client-facing prose), 3 = frontier

export type ModelInfo = {
  tokenizer: TokenizerGeneration
  /** Whether `output_config.effort` is accepted (Haiku 4.5 rejects it). */
  effort: boolean
  /** Adaptive thinking runs by default when `thinking` is omitted (Opus 5, Sonnet 5). */
  adaptiveThinking: boolean
  /** Minimum cacheable prefix in tokens (shorter prefixes silently don't cache). */
  minCachePrefixTokens: number
  contextWindow: number
  maxOutput: number
  /** Highest capability tier this model is trusted with. */
  capability: Capability
  /** 1 = cheapest, from ai_model_prices (Haiku $1/$5 < Sonnet 5 $2/$10 < Sonnet 4.6 $3/$15 < Opus $5/$25). */
  costRank: number
  /** 1 = fastest (docs: Haiku fastest, Sonnet fast, Opus moderate). */
  speedRank: number
  /** Eligible for automatic routing. A model dominated on cost AND quality by a newer one is kept for overrides only. */
  routable: boolean
}

/** Models the gateway knows how to price and configure. Anything else is refused. */
export const KNOWN_MODELS: Record<string, ModelInfo> = {
  'claude-opus-5': { tokenizer: 'v2', effort: true, adaptiveThinking: true, minCachePrefixTokens: 512, contextWindow: 1_000_000, maxOutput: 128_000, capability: 3, costRank: 4, speedRank: 3, routable: true },
  'claude-sonnet-5': { tokenizer: 'v2', effort: true, adaptiveThinking: true, minCachePrefixTokens: 1024, contextWindow: 1_000_000, maxOutput: 128_000, capability: 2, costRank: 2, speedRank: 2, routable: true },
  'claude-haiku-4-5-20251001': { tokenizer: 'v1', effort: false, adaptiveThinking: false, minCachePrefixTokens: 4096, contextWindow: 200_000, maxOutput: 64_000, capability: 1, costRank: 1, speedRank: 1, routable: true },
  'claude-haiku-4-5': { tokenizer: 'v1', effort: false, adaptiveThinking: false, minCachePrefixTokens: 4096, contextWindow: 200_000, maxOutput: 64_000, capability: 1, costRank: 1, speedRank: 1, routable: false }, // alias of the dated id — one routable entry per model
  // Dominated: Sonnet 5 is cheaper AND stronger than Sonnet 4.6; Opus 4.8 costs the same as Opus 5 for less. Override-only.
  'claude-sonnet-4-6': { tokenizer: 'v1', effort: true, adaptiveThinking: false, minCachePrefixTokens: 1024, contextWindow: 1_000_000, maxOutput: 128_000, capability: 2, costRank: 3, speedRank: 2, routable: false },
  'claude-opus-4-8': { tokenizer: 'v2', effort: true, adaptiveThinking: false, minCachePrefixTokens: 1024, contextWindow: 1_000_000, maxOutput: 128_000, capability: 3, costRank: 4, speedRank: 3, routable: false },
}

/** Ids that have retired — calling them 404s. Union of the three old per-file sets. */
export const RETIRED_MODELS: ReadonlySet<string> = new Set([
  'claude-sonnet-4-20250514',
  'claude-3-5-sonnet-20240620',
  'claude-3-5-sonnet-20241022',
  'claude-3-opus-20240229',
  'claude-3-haiku-20240307',
])

/**
 * The nature of the problem each purpose solves. `reasoning` decides the
 * capability tier (light → Haiku, moderate/deep → Sonnet 5, frontier → Opus 5);
 * `audience` and `latency` are recorded for the ledger and future policy;
 * `quality: 'frontier'` is the one explicit escalation (the portal chat — the
 * brief's "quality is the product" decision, not a hard-coded model).
 */
export type TaskProfile = {
  reasoning: 'light' | 'moderate' | 'deep'
  audience: 'client' | 'coach' | 'internal'
  latency: 'interactive' | 'background'
  quality?: 'standard' | 'frontier'
  /** Override the effort the reasoning tier implies (portal_degraded stays cheap). */
  effort?: AiEffort
}

export const PURPOSE_PROFILES: Record<AiPurpose, TaskProfile> = {
  // Client Portal
  portal_chat: { reasoning: 'deep', audience: 'client', latency: 'interactive', quality: 'frontier', effort: 'medium' },
  portal_degraded: { reasoning: 'deep', audience: 'client', latency: 'interactive', effort: 'medium' },
  portal_weekly_plan_extract: { reasoning: 'light', audience: 'client', latency: 'interactive' },
  // Background extraction
  background_compact: { reasoning: 'light', audience: 'internal', latency: 'background' },
  transcript_title: { reasoning: 'light', audience: 'internal', latency: 'background' },
  // Coach-side
  scoring: { reasoning: 'deep', audience: 'coach', latency: 'background' },
  scoring_suggest: { reasoning: 'moderate', audience: 'coach', latency: 'interactive' },
  growth_pass: { reasoning: 'deep', audience: 'coach', latency: 'background' },
  growth_bands: { reasoning: 'moderate', audience: 'coach', latency: 'interactive' },
  nudge_extract: { reasoning: 'moderate', audience: 'internal', latency: 'background' },
  nudge_draft: { reasoning: 'moderate', audience: 'client', latency: 'background' },
  note_narrative: { reasoning: 'moderate', audience: 'client', latency: 'interactive' },
  note_client_email: { reasoning: 'moderate', audience: 'client', latency: 'interactive' },
  session_prep: { reasoning: 'moderate', audience: 'client', latency: 'interactive' },
  goals_generate: { reasoning: 'moderate', audience: 'coach', latency: 'background' },
  plan_session: { reasoning: 'moderate', audience: 'coach', latency: 'interactive' },
}

function requiredCapability(profile: TaskProfile): Capability {
  if (profile.quality === 'frontier') return 3
  return profile.reasoning === 'light' ? 1 : 2
}

/**
 * Deterministic routing: among routable models whose capability meets the
 * profile, the cheapest wins; ties go to the faster one. No AI in the choice.
 */
export function routeModel(profile: TaskProfile): string {
  const need = requiredCapability(profile)
  const candidates = Object.entries(KNOWN_MODELS)
    .filter(([id, m]) => m.routable && m.capability >= need && !RETIRED_MODELS.has(id))
    .sort((a, b) => a[1].costRank - b[1].costRank || a[1].speedRank - b[1].speedRank)
  if (!candidates.length) throw new Error(`No routable model meets capability ${need} — update the catalog in lib/ai/models.ts.`)
  return candidates[0][0]
}

/** The routed model per purpose (no overrides applied). */
export const DEFAULT_MODELS: Record<AiPurpose, string> = Object.fromEntries(
  (Object.keys(PURPOSE_PROFILES) as AiPurpose[]).map((p) => [p, routeModel(PURPOSE_PROFILES[p])])
) as Record<AiPurpose, string>

/**
 * Effort per reasoning tier. Sonnet 5 / Opus 5 run adaptive thinking by
 * default; effort is the calibrated dial for how much. `medium` on Sonnet 5 is
 * the documented equivalent of Sonnet 4.6 at its default — quality held, cost
 * down; `high` for the deep-judgment passes (scoring, growth). Kept constant
 * per purpose: a changed top-level effort invalidates the prompt cache.
 */
const EFFORT_BY_REASONING: Record<TaskProfile['reasoning'], AiEffort> = { light: 'low', moderate: 'medium', deep: 'high' }

/**
 * Output headroom for thinking, per effort. Thinking tokens count inside
 * `max_tokens`, so a caller's visible-output budget gets this added on top
 * for models that think by default (Haiku does not). Sized so a truncated
 * reply is the exception, not a cost sink.
 */
const THINKING_ALLOWANCE: Record<AiEffort, number> = { low: 1500, medium: 3000, high: 6000, xhigh: 12000, max: 16000 }

/** Pre-Phase-1 env vars — retired in Phase 4. Set, they are ignored with a warning. */
const LEGACY_ENV_KEYS = ['SCORING_MODEL', 'SUGGEST_MODEL', 'GENERATE_MODEL', 'GOALS_MODEL', 'NUDGE_MODEL', 'PLAN_SESSION_MODEL', 'TITLE_MODEL', 'PORTAL_CHAT_MODEL'] as const

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
 * Resolve the model id for a purpose: AI_MODEL_<PURPOSE> → the routed default.
 * An override naming a retired or unknown model is ignored (warned once); a
 * retired legacy env var is ignored (warned once).
 */
export function resolveModel(purpose: AiPurpose): string {
  const fallback = DEFAULT_MODELS[purpose]
  if (!fallback) throw new Error(`Unknown AI purpose "${purpose}".`)
  if (RETIRED_MODELS.has(fallback) || !KNOWN_MODELS[fallback]) {
    // A routed model must always be a live, priced model — this is a catalog bug, not config.
    throw new Error(`Routed model for "${purpose}" (${fallback}) is retired or unknown — update the catalog in lib/ai/models.ts.`)
  }

  for (const key of LEGACY_ENV_KEYS) {
    if (process.env[key]?.trim()) warnOnce(`legacy:${key}`, `${key} is retired and ignored since Phase 4 — models are routed per purpose; pin one with AI_MODEL_<PURPOSE> (e.g. ${envKeyFor(purpose)}).`)
  }
  const key = envKeyFor(purpose)
  const value = process.env[key]?.trim()
  if (value) {
    if (RETIRED_MODELS.has(value)) {
      warnOnce(`${key}:${value}`, `${key}="${value}" is retired; using ${fallback} for ${purpose}. Update the env var to a current model id.`)
    } else if (!KNOWN_MODELS[value]) {
      warnOnce(`${key}:${value}`, `${key}="${value}" is not a model the AI gateway knows (no price/config); using ${fallback} for ${purpose}. Add it to lib/ai/models.ts + ai_model_prices first.`)
    } else {
      return value
    }
  }
  return fallback
}

export function modelInfo(model: string): ModelInfo | null {
  return KNOWN_MODELS[model] ?? null
}

/** Effort to send for a purpose on a model, or undefined when the model has no effort dial. */
export function effortFor(purpose: AiPurpose, model: string): AiEffort | undefined {
  const profile = PURPOSE_PROFILES[purpose]
  if (!profile || !modelInfo(model)?.effort) return undefined
  return profile.effort ?? EFFORT_BY_REASONING[profile.reasoning]
}

/** Extra `max_tokens` to leave for adaptive thinking (0 for models that don't think by default). */
export function thinkingAllowance(model: string, effort: AiEffort | undefined): number {
  if (!modelInfo(model)?.adaptiveThinking) return 0
  return THINKING_ALLOWANCE[effort ?? 'high']
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
