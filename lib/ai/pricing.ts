/**
 * Price lookup + cost arithmetic for the AI ledger. Prices are DATA
 * (`ai_model_prices`, migration 069) — never hardcoded here. All money is
 * integer USD micros (1 USD = 1_000_000); token prices are micros per million
 * tokens, so cost = tokens × price ÷ 1_000_000, rounded up (never under-bill
 * ourselves).
 *
 * No AI in the math: deterministic integer arithmetic only.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AiModelPrice, Database } from '@/lib/supabase/types'

type Db = SupabaseClient<Database>

export type ModelPrice = Pick<
  AiModelPrice,
  'model' | 'input_per_mtok_micros' | 'output_per_mtok_micros' | 'cache_read_per_mtok_micros' | 'cache_write_per_mtok_micros' | 'effective_from'
>

export type TokenUsage = {
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
}

const MTOK = 1_000_000
const CACHE_TTL_MS = 5 * 60_000
const cache = new Map<string, { price: ModelPrice | null; at: number }>()

/** Ceil(tokens × micros_per_mtok ÷ 1e6) as a safe integer. */
export function tokensCostMicros(tokens: number, perMtokMicros: number): number {
  if (!tokens || !perMtokMicros) return 0
  return Math.ceil((tokens * perMtokMicros) / MTOK)
}

/** Actual cost of a settled request. */
export function usageCostMicros(usage: TokenUsage, price: ModelPrice): number {
  return (
    tokensCostMicros(usage.input_tokens, price.input_per_mtok_micros) +
    tokensCostMicros(usage.output_tokens, price.output_per_mtok_micros) +
    tokensCostMicros(usage.cache_read_tokens, price.cache_read_per_mtok_micros) +
    tokensCostMicros(usage.cache_write_tokens, price.cache_write_per_mtok_micros)
  )
}

/**
 * Worst case for a request: every estimated input token at the full (uncached)
 * input price + the whole `max_tokens` at the output price. This is what gets
 * RESERVED before the call (Phase 2 checks it against the caps).
 */
export function worstCaseMicros(estimatedInputTokens: number, maxTokens: number, price: ModelPrice): number {
  return tokensCostMicros(estimatedInputTokens, price.input_per_mtok_micros) + tokensCostMicros(maxTokens, price.output_per_mtok_micros)
}

/**
 * The price row in force today for `model` (newest effective_from ≤ today).
 * Cached in memory for 5 min. Returns null when no row exists — the caller
 * decides (Phase 1 logs and settles with actual_usd_micros NULL; Phase 2 refuses).
 */
export async function loadModelPrice(supabase: Db, model: string): Promise<ModelPrice | null> {
  const hit = cache.get(model)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.price
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('ai_model_prices')
    .select('model, input_per_mtok_micros, output_per_mtok_micros, cache_read_per_mtok_micros, cache_write_per_mtok_micros, effective_from')
    .eq('model', model)
    .lte('effective_from', today)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`ai_model_prices read failed: ${error.message}`)
  const price = (data as ModelPrice | null) ?? null
  cache.set(model, { price, at: Date.now() })
  return price
}

/** Test seam. */
export function clearPriceCache() {
  cache.clear()
}

export function formatUsd(micros: number | null | undefined, digits = 2): string {
  if (micros == null) return '—'
  return `$${(micros / MTOK).toFixed(digits)}`
}
