/**
 * AI cost cockpit — the pure arithmetic (cost-controls brief, Phase 4).
 *
 * Everything here is deterministic over ledger rows (`ai_usage`) and cap rows
 * (`ai_budgets`); no I/O, no AI. The loaders in lib/ai/costs.ts fetch the rows
 * and hand them in; scripts/spikes/verify-ai-costs.js checks the rules.
 *
 * Money is integer USD micros throughout (lib/ai/pricing.ts convention).
 */

export type UsageRow = {
  coach_id: string | null
  client_id: string | null
  principal: 'coach' | 'client' | 'system' | string
  purpose: string
  feature: string
  model: string
  status: 'reserved' | 'settled' | 'released' | string
  reserved_usd_micros: number
  actual_usd_micros: number | null
  input_tokens: number | null
  output_tokens: number | null
  cache_read_tokens: number | null
  cache_write_tokens: number | null
  created_at: string
}

export type BudgetRow = {
  scope: 'org' | 'client' | 'feature' | string
  scope_id: string
  /** YYYY-MM-DD (first of month) or null = standing. */
  period_month: string | null
  cap_usd_micros: number
  soft_pct: number
  enabled: boolean
}

export type CapState = 'ok' | 'soft' | 'hard' | 'none'

export type Bucket = {
  key: string
  /** Σ coalesce(actual, reserved) over reserved + settled rows — what the budget counts. */
  spent: number
  requests: number
  settled: number
  reserved: number
  released: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  lastAt: string | null
}

/** What a row counts against the budget: released rows are free (the call failed). */
export function rowCostMicros(r: Pick<UsageRow, 'status' | 'reserved_usd_micros' | 'actual_usd_micros'>): number {
  if (r.status === 'released') return 0
  if (r.status === 'settled') return r.actual_usd_micros ?? r.reserved_usd_micros ?? 0
  return r.reserved_usd_micros ?? 0
}

/** First day of the UTC month as YYYY-MM-DD (the ledger's period key). */
export function monthKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

/** Parse "YYYY-MM" or "YYYY-MM-DD" into a month key; null when malformed. */
export function parseMonth(input: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})/.exec((input || '').trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  if (mo < 1 || mo > 12 || y < 2020 || y > 2100) return null
  return `${m[1]}-${m[2]}-01`
}

export type MonthBounds = {
  month: string
  /** ISO instants, [start, end). */
  startIso: string
  endIso: string
  days: number
  /** Days elapsed in the month as of `now` (1..days), 0 for a future month, `days` for a past one. */
  elapsedDays: number
  isCurrent: boolean
}

export function monthBounds(month: string, now = new Date()): MonthBounds {
  const [y, m] = month.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1))
  const end = new Date(Date.UTC(y, m, 1))
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000)
  let elapsedDays: number
  if (now.getTime() < start.getTime()) elapsedDays = 0
  else if (now.getTime() >= end.getTime()) elapsedDays = days
  else elapsedDays = Math.floor((now.getTime() - start.getTime()) / 86_400_000) + 1
  return { month, startIso: start.toISOString(), endIso: end.toISOString(), days, elapsedDays, isCurrent: elapsedDays > 0 && elapsedDays < days + 1 && now.getTime() < end.getTime() }
}

/** Straight-line month-end projection from spend so far. */
export function projectMonthEnd(spent: number, bounds: Pick<MonthBounds, 'days' | 'elapsedDays'>): number {
  if (bounds.elapsedDays <= 0) return 0
  return Math.round((spent / bounds.elapsedDays) * bounds.days)
}

function emptyBucket(key: string): Bucket {
  return { key, spent: 0, requests: 0, settled: 0, reserved: 0, released: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, lastAt: null }
}

function add(b: Bucket, r: UsageRow) {
  b.spent += rowCostMicros(r)
  b.requests++
  if (r.status === 'settled') b.settled++
  else if (r.status === 'released') b.released++
  else b.reserved++
  b.input += r.input_tokens ?? 0
  b.output += r.output_tokens ?? 0
  b.cacheRead += r.cache_read_tokens ?? 0
  b.cacheWrite += r.cache_write_tokens ?? 0
  if (!b.lastAt || r.created_at > b.lastAt) b.lastAt = r.created_at
}

/** cache reads ÷ all input-side tokens; null when nothing was read. */
export function cacheReadRatio(b: Pick<Bucket, 'input' | 'cacheRead' | 'cacheWrite'>): number | null {
  const denom = b.input + b.cacheRead + b.cacheWrite
  return denom > 0 ? b.cacheRead / denom : null
}

export type UsageAggregate = {
  total: Bucket
  /** Client-principal spend — the org ceiling's scope. */
  clientPrincipal: Bucket
  coachPrincipal: Bucket
  systemPrincipal: Bucket
  byPurpose: Bucket[]
  byModel: Bucket[]
  byClient: Bucket[]
  byCoach: Bucket[]
  /** The portal chat alone (purpose portal_chat), for the cache-ratio target. */
  portalChat: Bucket
}

const bySpendDesc = (a: Bucket, b: Bucket) => b.spent - a.spent || b.requests - a.requests || a.key.localeCompare(b.key)

/** Group a month's rows every way the cockpit shows them. Pure. */
export function aggregateUsage(rows: UsageRow[]): UsageAggregate {
  const total = emptyBucket('total')
  const clientPrincipal = emptyBucket('client')
  const coachPrincipal = emptyBucket('coach')
  const systemPrincipal = emptyBucket('system')
  const portalChat = emptyBucket('portal_chat')
  const purpose = new Map<string, Bucket>()
  const model = new Map<string, Bucket>()
  const client = new Map<string, Bucket>()
  const coach = new Map<string, Bucket>()
  const into = (map: Map<string, Bucket>, key: string, r: UsageRow) => {
    let b = map.get(key)
    if (!b) map.set(key, (b = emptyBucket(key)))
    add(b, r)
  }
  for (const r of rows) {
    add(total, r)
    if (r.principal === 'client') add(clientPrincipal, r)
    else if (r.principal === 'coach') add(coachPrincipal, r)
    else add(systemPrincipal, r)
    if (r.purpose === 'portal_chat') add(portalChat, r)
    into(purpose, r.purpose, r)
    into(model, r.model, r)
    // Client spend = client-principal only (the cap's definition); a coach's
    // scoring of that client's session is the coach's cost, not the client's.
    if (r.client_id && r.principal === 'client') into(client, r.client_id, r)
    if (r.coach_id) into(coach, r.coach_id, r)
  }
  return {
    total,
    clientPrincipal,
    coachPrincipal,
    systemPrincipal,
    portalChat,
    byPurpose: Array.from(purpose.values()).sort(bySpendDesc),
    byModel: Array.from(model.values()).sort(bySpendDesc),
    byClient: Array.from(client.values()).sort(bySpendDesc),
    byCoach: Array.from(coach.values()).sort(bySpendDesc),
  }
}

export type ResolvedCap = { cap: number; softPct: number; source: string }

/**
 * Mirror of the SQL `ai_resolve_cap`: for each candidate scope id in order,
 * the enabled row dated THIS month wins over the standing (null-month) row;
 * the first scope id with any row decides. Null = no cap.
 */
export function resolveCap(budgets: BudgetRow[], scope: string, scopeIds: Array<string | null | undefined>, month: string): ResolvedCap | null {
  for (const sid of scopeIds) {
    if (!sid) continue
    const rows = budgets.filter((b) => b.enabled && b.scope === scope && b.scope_id === sid && (b.period_month === month || b.period_month === null))
    if (!rows.length) continue
    rows.sort((a, b) => (b.period_month ? 1 : 0) - (a.period_month ? 1 : 0))
    const r = rows[0]
    return { cap: r.cap_usd_micros, softPct: r.soft_pct, source: r.scope_id }
  }
  return null
}

export function capState(spent: number, cap: ResolvedCap | null): CapState {
  if (!cap) return 'none'
  if (spent >= cap.cap) return 'hard'
  if (spent * 100 >= cap.cap * cap.softPct) return 'soft'
  return 'ok'
}

/** Whole-percent of cap, capped at 999 so a blown cap still renders. */
export function pctOfCap(spent: number, cap: ResolvedCap | null): number | null {
  if (!cap || cap.cap <= 0) return null
  return Math.min(999, Math.round((spent / cap.cap) * 100))
}

/** Client-scope candidate ids, in resolution order (matches ai_budget_status). */
export function clientCapIds(clientId: string, clientType: string | null | undefined): string[] {
  return [clientId, `default:${clientType || 'client'}`, 'default']
}

export const USD_MICROS = 1_000_000
