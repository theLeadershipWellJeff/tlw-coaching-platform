/**
 * Budget enforcement for the AI gateway (Phase 2; migration 070).
 *
 * Deterministic code only — no AI in budget math. The atomic decision lives in
 * Postgres (`ai_reserve`): under a per-org lock it sums the month's spend for
 * every scope a call falls under (client · org · feature), refuses when spend +
 * worst case would exceed an enabled cap, and otherwise inserts the reserved
 * ledger row. This module wraps that, the read-only status the pre-check and
 * the coach's card use, and the stale-reservation sweep. Fail closed: any
 * error here refuses the call.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AiBudgetStatus, Database } from '@/lib/supabase/types'
import { AiGatewayError } from './errors'

type Db = SupabaseClient<Database>

export type ReserveArgs = {
  requestId: string
  orgId: string | null
  coachId: string | null
  clientId: string | null
  principal: 'coach' | 'client' | 'system'
  purpose: string
  feature: string
  model: string
  reservedMicros: number
  metadata: Record<string, unknown>
}

export const DEFAULT_ORG_ID = '00000000-0000-4000-8000-000000000001'

function isMissingFunction(error: { code?: string; message?: string }): boolean {
  return error.code === '42883' || error.code === 'PGRST202' || /ai_reserve|ai_budget_status|schema cache|function/i.test(error.message || '')
}

/** Reserve a ledger row, or throw (`budget_exceeded` / `ledger_*`). Returns the row id. */
export async function reserve(supabase: Db, args: ReserveArgs): Promise<string> {
  const { data, error } = await supabase.rpc('ai_reserve', {
    p_request_id: args.requestId,
    p_org_id: args.orgId ?? DEFAULT_ORG_ID,
    p_coach_id: args.coachId,
    p_client_id: args.clientId,
    p_principal: args.principal,
    p_purpose: args.purpose,
    p_feature: args.feature,
    p_model: args.model,
    p_reserved: args.reservedMicros,
    p_metadata: args.metadata,
  })
  if (error) {
    if (isMissingFunction(error)) {
      throw new AiGatewayError('ledger_unavailable', 'AI budget function is not available (apply migration 070_ai_budget_enforcement.sql) — refusing to call the model unmetered.')
    }
    throw new AiGatewayError('ledger_error', `AI reserve failed — refusing to call the model unmetered: ${error.message}`)
  }
  const result = data as Database['public']['Functions']['ai_reserve']['Returns'] | null
  if (!result) throw new AiGatewayError('ledger_error', 'AI reserve returned nothing — refusing to call the model unmetered.')
  if (!result.ok) {
    throw new AiBudgetExceededError(result.scope, result.cap, result.spent, result.reserved, result.resets_on)
  }
  return result.id
}

export class AiBudgetExceededError extends AiGatewayError {
  scope: 'client' | 'org' | 'feature'
  capMicros: number
  spentMicros: number
  reservedMicros: number
  resetsOn: string
  constructor(scope: 'client' | 'org' | 'feature', cap: number, spent: number, reserved: number, resetsOn: string) {
    super('budget_exceeded', `AI budget exhausted for scope "${scope}" (spent ${spent} + reserve ${reserved} > cap ${cap} micros); resets ${resetsOn}.`)
    this.name = 'AiBudgetExceededError'
    this.scope = scope
    this.capMicros = cap
    this.spentMicros = spent
    this.reservedMicros = reserved
    this.resetsOn = resetsOn
  }
}

/** Read-only status for a call's scopes (the pre-check, the coach card, the cockpit). */
export async function budgetStatus(
  supabase: Db,
  args: { orgId: string | null; clientId: string | null; principal: 'coach' | 'client' | 'system' | null; purpose: string | null }
): Promise<AiBudgetStatus> {
  const { data, error } = await supabase.rpc('ai_budget_status', {
    p_org_id: args.orgId ?? DEFAULT_ORG_ID,
    p_client_id: args.clientId,
    p_principal: args.principal,
    p_purpose: args.purpose,
  })
  if (error) {
    if (isMissingFunction(error)) throw new AiGatewayError('ledger_unavailable', 'AI budget function is not available (apply migration 070_ai_budget_enforcement.sql).')
    throw new AiGatewayError('ledger_error', `AI budget status failed: ${error.message}`)
  }
  return data as AiBudgetStatus
}

/** Release reservations older than `minutes` (a function killed mid-call). Returns the count. */
export async function releaseStale(supabase: Db, minutes = 15): Promise<number> {
  const { data, error } = await supabase.rpc('ai_release_stale', { p_minutes: minutes })
  if (error) throw new Error(`ai_release_stale failed: ${error.message}`)
  return Number(data ?? 0)
}

/** First day of next month (UTC), as the client-facing reset date. */
export function formatResetDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })
}

/** The warm, on-brand pause message (brief §Phase 2). */
export function pausedMessage(resetsOn: string): string {
  return `Your reflection space has used its allowance for this month and resets on ${formatResetDate(resetsOn)} — your coach can extend it anytime.`
}
