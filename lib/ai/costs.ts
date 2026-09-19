/**
 * AI cost cockpit — loaders + report builders (cost-controls brief, Phase 4).
 *
 * Two reports over the same ledger:
 *   buildOrgCostReport   supervisor: the whole org for one month — spend by
 *                        feature / model / coach / client, % of every cap,
 *                        top clients with their invoiced revenue beside their
 *                        assistant spend, cache-read ratio, month-end projection.
 *   buildCoachCostReport a coach: ONLY their own clients' portal (client-
 *                        principal) usage and cap state — scoped by the
 *                        coach_clients link, never by anything the request sends.
 *
 * Arithmetic lives in lib/ai/costs-math.ts (pure). Reads are defensive: a
 * missing ledger (pre-069) surfaces as `unavailable`, never a 500.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { accessibleClientIds } from '@/lib/client-access'
import {
  aggregateUsage,
  cacheReadRatio,
  capState,
  clientCapIds,
  monthBounds,
  pctOfCap,
  projectMonthEnd,
  resolveCap,
  type Bucket,
  type BudgetRow,
  type CapState,
  type MonthBounds,
  type UsageRow,
} from './costs-math'

type Db = SupabaseClient<Database>

const PAGE = 1000
const USAGE_COLUMNS = 'coach_id, client_id, principal, purpose, feature, model, status, reserved_usd_micros, actual_usd_micros, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, created_at'

export class LedgerUnavailableError extends Error {
  constructor(detail: string) {
    super(`AI usage ledger unavailable (apply migration 069): ${detail}`)
    this.name = 'LedgerUnavailableError'
  }
}

function isMissingRelation(message: string): boolean {
  return /relation .* does not exist|schema cache|PGRST205|42P01/i.test(message)
}

/** Every ledger row for the month, paged past PostgREST's 1000-row default. */
export async function loadUsageRows(
  supabase: Db,
  opts: { orgId: string; bounds: MonthBounds; clientIds?: string[]; principal?: 'client' | 'coach' | 'system' }
): Promise<UsageRow[]> {
  if (opts.clientIds && opts.clientIds.length === 0) return []
  const out: UsageRow[] = []
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from('ai_usage')
      .select(USAGE_COLUMNS)
      .eq('org_id', opts.orgId)
      .gte('created_at', opts.bounds.startIso)
      .lt('created_at', opts.bounds.endIso)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (opts.clientIds) q = q.in('client_id', opts.clientIds)
    if (opts.principal) q = q.eq('principal', opts.principal)
    const { data, error } = await q
    if (error) {
      if (isMissingRelation(error.message)) throw new LedgerUnavailableError(error.message)
      throw new Error(`Supabase (ai_usage read): ${error.message}`)
    }
    const rows = (data ?? []) as unknown as UsageRow[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

export async function loadBudgets(supabase: Db, orgId: string): Promise<BudgetRow[]> {
  const { data, error } = await supabase
    .from('ai_budgets')
    .select('scope, scope_id, period_month, cap_usd_micros, soft_pct, enabled')
    .eq('org_id', orgId)
    .eq('enabled', true)
  if (error) {
    if (isMissingRelation(error.message)) throw new LedgerUnavailableError(error.message)
    throw new Error(`Supabase (ai_budgets read): ${error.message}`)
  }
  return (data ?? []) as BudgetRow[]
}

type ClientInfo = { id: string; name: string; client_type: string | null }

async function loadClientInfo(supabase: Db, ids: string[]): Promise<Map<string, ClientInfo>> {
  const map = new Map<string, ClientInfo>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from('clients').select('id, name, client_type').in('id', ids.slice(i, i + 200))
    for (const c of data ?? []) map.set(c.id, { id: c.id, name: c.name, client_type: c.client_type })
  }
  return map
}

async function loadCoachNames(supabase: Db, ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (!ids.length) return map
  const { data } = await supabase.from('coaches').select('id, name, email').in('id', ids)
  for (const c of data ?? []) map.set(c.id, c.name || c.email)
  return map
}

/**
 * Invoiced revenue per client for the month, in USD micros: every line of an
 * ISSUED invoice (sent / overdue / failed / paid) whose income date — paid,
 * else sent, else created — falls in the month, attributed through the
 * line's coachee to the client. Lines with no coachee (account-level items)
 * are not attributable and are left out. This is the billing side of the
 * brief's "cost per client vs. that client's revenue"; it is invoiced income,
 * not the session-fee estimate the dashboard revenue cards project.
 */
export async function loadInvoicedRevenueByClient(supabase: Db, opts: { bounds: MonthBounds; coachId?: string }): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  let q = supabase
    .from('invoices')
    .select('id, coach_id, status, paid_at, sent_at, created_at, invoice_lines ( amount, coachee_id, coachees ( client_id ) )')
    .in('status', ['sent', 'overdue', 'failed', 'paid'])
    .gte('created_at', new Date(new Date(opts.bounds.startIso).getTime() - 120 * 86_400_000).toISOString())
  if (opts.coachId) q = q.eq('coach_id', opts.coachId)
  const { data, error } = await q
  if (error) return out // billing not set up = no revenue column, never a failure
  for (const inv of (data as any[]) ?? []) {
    const whenIso: string | null = inv.paid_at || inv.sent_at || inv.created_at || null
    if (!whenIso || whenIso < opts.bounds.startIso || whenIso >= opts.bounds.endIso) continue
    for (const line of (inv.invoice_lines as any[]) ?? []) {
      const clientId: string | undefined = line?.coachees?.client_id
      if (!clientId) continue
      const amount = Number(line.amount)
      if (!Number.isFinite(amount) || amount <= 0) continue
      out.set(clientId, (out.get(clientId) ?? 0) + Math.round(amount * 1_000_000))
    }
  }
  return out
}

// ── Report shapes (what the routes return) ───────────────────────────────────

export type CapView = { cap: number | null; softPct: number | null; pct: number | null; state: CapState; source: string | null }

function capView(spent: number, cap: ReturnType<typeof resolveCap>): CapView {
  return { cap: cap?.cap ?? null, softPct: cap?.softPct ?? null, pct: pctOfCap(spent, cap), state: capState(spent, cap), source: cap?.source ?? null }
}

export type BucketView = Bucket & { cacheReadRatio: number | null }
const view = (b: Bucket): BucketView => ({ ...b, cacheReadRatio: cacheReadRatio(b) })

export type ClientCostRow = BucketView & {
  clientId: string
  name: string
  clientType: string | null
  cap: CapView
  /** Invoiced revenue this month (USD micros); null when billing has nothing for them. */
  revenue: number | null
  /** Assistant spend as a whole-percent of invoiced revenue; null without revenue. */
  spendPctOfRevenue: number | null
}

export type OrgCostReport = {
  month: string
  period: Pick<MonthBounds, 'startIso' | 'endIso' | 'days' | 'elapsedDays' | 'isCurrent'>
  totals: BucketView & { projected: number }
  principals: { client: BucketView; coach: BucketView; system: BucketView }
  /** The org ceiling — client-principal spend against the `org` cap. */
  portal: { spent: number; projected: number } & CapView
  portalChat: BucketView
  byPurpose: Array<BucketView & { cap: CapView }>
  byModel: BucketView[]
  byCoach: Array<BucketView & { coachId: string; name: string }>
  topClients: ClientCostRow[]
  clientCount: number
  generatedAt: string
}

export async function buildOrgCostReport(supabase: Db, opts: { orgId: string; month: string; now?: Date }): Promise<OrgCostReport> {
  const bounds = monthBounds(opts.month, opts.now)
  const [rows, budgets] = await Promise.all([loadUsageRows(supabase, { orgId: opts.orgId, bounds }), loadBudgets(supabase, opts.orgId)])
  const agg = aggregateUsage(rows)
  const clientIds = agg.byClient.map((b) => b.key)
  const [clients, coaches, revenue] = await Promise.all([
    loadClientInfo(supabase, clientIds.slice(0, 200)),
    loadCoachNames(supabase, agg.byCoach.map((b) => b.key)),
    loadInvoicedRevenueByClient(supabase, { bounds }),
  ])
  const orgCap = resolveCap(budgets, 'org', [opts.orgId], opts.month)
  const topClients: ClientCostRow[] = agg.byClient.slice(0, 10).map((b) => {
    const info = clients.get(b.key)
    const cap = resolveCap(budgets, 'client', clientCapIds(b.key, info?.client_type), opts.month)
    const rev = revenue.get(b.key) ?? null
    return {
      ...view(b),
      clientId: b.key,
      name: info?.name ?? 'Unknown client',
      clientType: info?.client_type ?? null,
      cap: capView(b.spent, cap),
      revenue: rev,
      spendPctOfRevenue: rev && rev > 0 ? Math.round((b.spent / rev) * 100) : null,
    }
  })
  return {
    month: opts.month,
    period: { startIso: bounds.startIso, endIso: bounds.endIso, days: bounds.days, elapsedDays: bounds.elapsedDays, isCurrent: bounds.isCurrent },
    totals: { ...view(agg.total), projected: projectMonthEnd(agg.total.spent, bounds) },
    principals: { client: view(agg.clientPrincipal), coach: view(agg.coachPrincipal), system: view(agg.systemPrincipal) },
    portal: { spent: agg.clientPrincipal.spent, projected: projectMonthEnd(agg.clientPrincipal.spent, bounds), ...capView(agg.clientPrincipal.spent, orgCap) },
    portalChat: view(agg.portalChat),
    byPurpose: agg.byPurpose.map((b) => ({ ...view(b), cap: capView(b.spent, resolveCap(budgets, 'feature', [b.key], opts.month)) })),
    byModel: agg.byModel.map(view),
    byCoach: agg.byCoach.map((b) => ({ ...view(b), coachId: b.key, name: coaches.get(b.key) ?? 'Unknown coach' })),
    topClients,
    clientCount: agg.byClient.length,
    generatedAt: new Date().toISOString(),
  }
}

export type CoachCostReport = {
  month: string
  period: OrgCostReport['period']
  /** Their clients' portal (client-principal) spend this month. */
  total: number
  clients: ClientCostRow[]
  generatedAt: string
}

/**
 * The coach view: their own clients' portal usage and cap status only. Rows
 * are selected by the coach_clients link (accessibleClientIds) and the client
 * principal — never the coach's own scoring/prep/nudge spend, and never
 * another coach's clients.
 */
export async function buildCoachCostReport(supabase: Db, opts: { coachId: string; orgId: string; month: string; now?: Date }): Promise<CoachCostReport> {
  const bounds = monthBounds(opts.month, opts.now)
  const ids = await accessibleClientIds(supabase, opts.coachId)
  const [rows, budgets, clients, revenue] = await Promise.all([
    loadUsageRows(supabase, { orgId: opts.orgId, bounds, clientIds: ids, principal: 'client' }),
    loadBudgets(supabase, opts.orgId),
    loadClientInfo(supabase, ids),
    loadInvoicedRevenueByClient(supabase, { bounds, coachId: opts.coachId }),
  ])
  const agg = aggregateUsage(rows)
  const byId = new Map(agg.byClient.map((b) => [b.key, b]))
  const clientsOut: ClientCostRow[] = []
  for (const id of ids) {
    const info = clients.get(id)
    const b = byId.get(id) ?? { key: id, spent: 0, requests: 0, settled: 0, reserved: 0, released: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, lastAt: null }
    if (!b.requests) continue // only clients who used the assistant this month
    const cap = resolveCap(budgets, 'client', clientCapIds(id, info?.client_type), opts.month)
    const rev = revenue.get(id) ?? null
    clientsOut.push({
      ...view(b),
      clientId: id,
      name: info?.name ?? 'Unknown client',
      clientType: info?.client_type ?? null,
      cap: capView(b.spent, cap),
      revenue: rev,
      spendPctOfRevenue: rev && rev > 0 ? Math.round((b.spent / rev) * 100) : null,
    })
  }
  clientsOut.sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name))
  return {
    month: opts.month,
    period: { startIso: bounds.startIso, endIso: bounds.endIso, days: bounds.days, elapsedDays: bounds.elapsedDays, isCurrent: bounds.isCurrent },
    total: agg.clientPrincipal.spent,
    clients: clientsOut,
    generatedAt: new Date().toISOString(),
  }
}
