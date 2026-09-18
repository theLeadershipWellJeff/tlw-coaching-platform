/**
 * THE ONLY PATH TO ANTHROPIC.
 *
 * Every model call in the app goes through `aiCreate` (buffered) or `aiStream`
 * (streamed). Both:
 *   1. resolve the model from the call's `purpose` (lib/ai/models.ts),
 *   2. write a `reserved` row to the usage ledger (`ai_usage`, migration 069)
 *      BEFORE the request — worst-case cost = estimated input × input price +
 *      max_tokens × output price — and
 *   3. settle that row with the response's real token usage AFTER (or release
 *      it with the error).
 *
 * Fail closed: if the ledger cannot be written the call is refused. Nothing
 * may reach Anthropic unmetered. (Phase 2 adds the budget check to step 2 —
 * the reserve is already the atomic unit it will need.)
 *
 * Direct `@anthropic-ai/sdk` imports anywhere else fail the build
 * (scripts/check-ai-imports.sh, run as `prebuild`).
 */
import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import type { AiPrincipal, Database } from '@/lib/supabase/types'
import { effortFor, estimateTokens, modelInfo, resolveModel, type AiEffort, type AiPurpose } from './models'
import { loadModelPrice, usageCostMicros, worstCaseMicros, type ModelPrice, type TokenUsage } from './pricing'

export type { AiPrincipal }
export type AiMessageStream = ReturnType<Anthropic['messages']['stream']>
export type AiMessage = Anthropic.Message

export type AiCallMeta = {
  purpose: AiPurpose
  /** Finer label for the ledger (e.g. 'portal_chat:general', 'scoring:rescore'). Defaults to the purpose. */
  feature?: string
  principal: AiPrincipal
  /** Tenant. null = the default org (the ledger column defaults to org #1). */
  orgId: string | null
  coachId: string | null
  clientId?: string | null
  /** Explicit model override (Phase 2 degraded routing). Must be a known model. */
  model?: string
  /** Override the purpose's effort; `null` forces the parameter off. */
  effort?: AiEffort | null
  /** Free-form, stored on the ledger row (e.g. mode, source). Never client content. */
  metadata?: Record<string, unknown>
}

export type AiRequest = {
  system?: string | Anthropic.TextBlockParam[]
  messages: Anthropic.MessageParam[]
  max_tokens: number
  /** Connect/first-byte timeout (retried once). Default 60 s. */
  timeoutMs?: number
}

export type AiGatewayErrorCode = 'not_configured' | 'unknown_model' | 'ledger_unavailable' | 'ledger_error' | 'price_error'

export class AiGatewayError extends Error {
  code: AiGatewayErrorCode
  constructor(code: AiGatewayErrorCode, message: string) {
    super(message)
    this.name = 'AiGatewayError'
    this.code = code
  }
}

type Db = ReturnType<typeof getSupabaseAdmin>
type LedgerRow = { id: string; request_id: string; model: string; price: ModelPrice | null }

const DEFAULT_TIMEOUT_MS = 60_000
/** One automatic retry per call (brief: "max 1 automatic retry"). */
const MAX_RETRIES = 1

let sharedClient: Anthropic | null = null
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AiGatewayError('not_configured', 'ANTHROPIC_API_KEY is not configured.')
  }
  if (!sharedClient) sharedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: MAX_RETRIES })
  return sharedClient
}

export function isAiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

/** First text block of a response, trimmed ('' when none). */
export function textOf(message: Anthropic.Message): string {
  const block = message.content.find((b) => b.type === 'text')
  return block && 'text' in block ? block.text.trim() : ''
}

function charsOf(req: AiRequest): number {
  let n = 0
  if (typeof req.system === 'string') n += req.system.length
  else if (Array.isArray(req.system)) for (const b of req.system) n += b.text.length
  for (const m of req.messages) {
    if (typeof m.content === 'string') n += m.content.length
    else for (const b of m.content) n += b.type === 'text' ? b.text.length : JSON.stringify(b).length
  }
  return n
}

function usageOf(message: Anthropic.Message): TokenUsage {
  const u = message.usage
  return {
    input_tokens: u.input_tokens ?? 0,
    output_tokens: u.output_tokens ?? 0,
    cache_read_tokens: u.cache_read_input_tokens ?? 0,
    cache_write_tokens: u.cache_creation_input_tokens ?? 0,
  }
}

function errorText(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`.slice(0, 2000)
  return String(e).slice(0, 2000)
}

function isMissingTable(error: { code?: string; message?: string }): boolean {
  return error.code === '42P01' || error.code === 'PGRST205' || /ai_usage|schema cache/i.test(error.message || '')
}

/** Resolve model + effort + params and RESERVE the ledger row. Throws before any API call. */
async function prepare(meta: AiCallMeta, req: AiRequest) {
  const client = getClient()
  const model = meta.model ?? resolveModel(meta.purpose)
  if (!modelInfo(model)) {
    throw new AiGatewayError('unknown_model', `Model "${model}" is not registered in lib/ai/models.ts.`)
  }
  const effort = meta.effort === null ? undefined : meta.effort ?? effortFor(meta.purpose, model)
  const supabase = getSupabaseAdmin()

  let price: ModelPrice | null = null
  try {
    price = await loadModelPrice(supabase, model)
  } catch (e) {
    throw new AiGatewayError('price_error', errorText(e))
  }
  const estimatedInput = estimateTokens(charsOf(req), model)
  const reserved = price ? worstCaseMicros(estimatedInput, req.max_tokens, price) : 0
  if (!price) console.error(`[ai] no price row for ${model} — settling with actual_usd_micros NULL (add it to ai_model_prices).`)

  const requestId = randomUUID()
  const insert: Database['public']['Tables']['ai_usage']['Insert'] = {
    request_id: requestId,
    ...(meta.orgId ? { org_id: meta.orgId } : {}),
    coach_id: meta.coachId ?? null,
    client_id: meta.clientId ?? null,
    principal: meta.principal,
    purpose: meta.purpose,
    feature: meta.feature ?? meta.purpose,
    model,
    status: 'reserved',
    reserved_usd_micros: reserved,
    metadata: {
      ...(meta.metadata ?? {}),
      ...(effort ? { effort } : {}),
      estimated_input_tokens: estimatedInput,
      max_tokens: req.max_tokens,
      ...(price ? {} : { price_missing: true }),
    },
  }
  const { data, error } = await supabase.from('ai_usage').insert(insert).select('id').single()
  if (error || !data) {
    const err = error ?? { message: 'no row returned' }
    if (isMissingTable(err)) {
      throw new AiGatewayError(
        'ledger_unavailable',
        'AI usage ledger is not available (apply migration 069_ai_cost_controls.sql) — refusing to call the model unmetered.'
      )
    }
    throw new AiGatewayError('ledger_error', `AI usage ledger write failed — refusing to call the model unmetered: ${err.message}`)
  }
  const ledger: LedgerRow = { id: data.id, request_id: requestId, model, price }

  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: req.max_tokens,
    messages: req.messages,
    ...(req.system !== undefined ? { system: req.system } : {}),
    ...(effort ? { output_config: { effort } } : {}),
  }
  return { client, supabase, ledger, params, timeout: req.timeoutMs ?? DEFAULT_TIMEOUT_MS }
}

async function settle(supabase: Db, ledger: LedgerRow, message: Anthropic.Message, durationMs: number): Promise<void> {
  const usage = usageOf(message)
  const actual = ledger.price ? usageCostMicros(usage, ledger.price) : null
  try {
    const { error } = await supabase
      .from('ai_usage')
      .update({
        status: 'settled',
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_read_tokens: usage.cache_read_tokens,
        cache_write_tokens: usage.cache_write_tokens,
        actual_usd_micros: actual,
        stop_reason: message.stop_reason ?? null,
        duration_ms: durationMs,
        settled_at: new Date().toISOString(),
      })
      .eq('id', ledger.id)
      .eq('status', 'reserved')
    if (error) console.error(`[ai] ledger settle failed for ${ledger.request_id}:`, error.message)
  } catch (e) {
    console.error(`[ai] ledger settle failed for ${ledger.request_id}:`, errorText(e))
  }
}

async function release(supabase: Db, ledger: LedgerRow, e: unknown, durationMs: number): Promise<void> {
  try {
    const { error } = await supabase
      .from('ai_usage')
      .update({ status: 'released', error: errorText(e), duration_ms: durationMs, settled_at: new Date().toISOString() })
      .eq('id', ledger.id)
      .eq('status', 'reserved')
    if (error) console.error(`[ai] ledger release failed for ${ledger.request_id}:`, error.message)
  } catch (err) {
    console.error(`[ai] ledger release failed for ${ledger.request_id}:`, errorText(err))
  }
}

/** Buffered call. Reserves → calls → settles (or releases and rethrows). */
export async function aiCreate(meta: AiCallMeta, req: AiRequest): Promise<Anthropic.Message> {
  const { client, supabase, ledger, params, timeout } = await prepare(meta, req)
  const started = Date.now()
  try {
    const message = await client.messages.create(params, { timeout })
    await settle(supabase, ledger, message, Date.now() - started)
    return message
  } catch (e) {
    await release(supabase, ledger, e, Date.now() - started)
    throw e
  }
}

const ledgerPromises = new WeakMap<object, Promise<void>>()

/**
 * Streamed call. Returns the SDK MessageStream (iterate it, or await
 * `finalMessage()`); the ledger row settles on the stream's final message and
 * releases on error/abort. `await ledgerDone(stream)` before a serverless
 * function returns so the settle write is not cut off.
 */
export async function aiStream(meta: AiCallMeta, req: AiRequest): Promise<AiMessageStream> {
  const { client, supabase, ledger, params, timeout } = await prepare(meta, req)
  const started = Date.now()
  const stream = client.messages.stream({ ...params, stream: true }, { timeout })
  let closed = false
  const done = new Promise<void>((resolve) => {
    const finish = (p: Promise<void>) => {
      if (closed) return
      closed = true
      p.then(resolve, resolve)
    }
    stream.on('finalMessage', (message) => finish(settle(supabase, ledger, message, Date.now() - started)))
    stream.on('error', (e) => finish(release(supabase, ledger, e, Date.now() - started)))
    stream.on('abort', (e) => finish(release(supabase, ledger, e, Date.now() - started)))
    // Ended without a final message or an error (should not happen) — release, don't leave it reserved.
    stream.on('end', () => finish(release(supabase, ledger, new Error('stream ended without a final message'), Date.now() - started)))
  })
  ledgerPromises.set(stream, done)
  return stream
}

/** Resolves once the stream's ledger row is settled or released. */
export function ledgerDone(stream: AiMessageStream): Promise<void> {
  return ledgerPromises.get(stream) ?? Promise.resolve()
}

/**
 * Exact input-token count for a request (free endpoint, separate rate limit).
 * Falls back to the character estimator on any failure so callers can always
 * budget. Counts under the tokenizer of `model`.
 */
export async function aiCountTokens(model: string, req: Pick<AiRequest, 'system' | 'messages'>): Promise<{ tokens: number; exact: boolean }> {
  try {
    const res = await getClient().messages.countTokens({
      model,
      messages: req.messages,
      ...(req.system !== undefined ? { system: req.system } : {}),
    })
    return { tokens: res.input_tokens, exact: true }
  } catch (e) {
    console.warn('[ai] count_tokens failed, using estimate:', errorText(e))
    return { tokens: estimateTokens(charsOf({ ...req, max_tokens: 0 }), model), exact: false }
  }
}
