/**
 * Billing run assembler — the heart of the Business Center.
 *
 * assembleRun() scans all active, TLW-owned engagements for the coach and
 * builds draft invoices grouped by billing account. It is intentionally
 * deterministic: no AI, no heuristics. Given the same inputs it produces
 * the same invoices every time.
 *
 * Idempotency: a second call for the same period skips any account that
 * already has a non-void invoice covering that exact period. Sessions already
 * marked billed_invoice_id are never re-pulled (re-bill guard in sessions.ts).
 *
 * Nothing sends or charges. That is Phase 4.
 *
 * Cycle semantics: [periodStart, periodEnd] is the BILLING CYCLE (normally the
 * current calendar month, picked on the run page).
 *  arrears        → hourly clients bill in arrears: pull unbilled delivered
 *                   sessions from the ONE MONTH immediately before the cycle
 *                   (a July cycle bills June sessions). The run never reaches
 *                   further back — older unbilled sessions (e.g. billed in a
 *                   different system) stay out. One line per coachee (grouped,
 *                   with dates), per-coachee for enterprise; one grouped line
 *                   for solo.
 *  subscription   → billed in advance: a flat monthly line at
 *                   engagement.monthly_amount for the cycle month itself.
 *                   Deduped against existing invoices for the period.
 *  per_engagement → surface any installment whose due_date ≤ periodEnd that
 *                   hasn't already been invoiced (tracked via
 *                   invoice_lines for the coachee + source).
 *
 * Account grouping: invoices group by the COACHEE'S CURRENT billing account,
 * not the engagement's stored billing_account_id — so a client moved onto an
 * enterprise account rolls up to the enterprise invoice even if their
 * engagement row still points at the old solo account.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { deriveBillableSessions } from './sessions'
import type { BillableSession, InstallmentScheduleEntry } from './types'

export type RunWarning = {
  kind: 'no_calendar_sessions' | 'subscription_no_sessions'
  clientName: string
  detail: string
}

export type RunResult = {
  created: number     // new draft invoices assembled
  skipped: number     // accounts skipped (already invoiced for period)
  empty: number       // accounts with nothing due
  invoiceIds: string[]
  warnings: RunWarning[]
  debug?: string[]    // human-readable explanation of what was found / skipped
}

type EngagementRow = {
  id: string
  coach_id: string
  billing_account_id: string
  coachee_id: string
  billing_mode: string
  billing_owner: string
  status: string
  skip_billing: boolean
  rate_hourly: number | null
  monthly_amount: number | null
  billing_day: number | null
  engagement_total: number | null
  installment_count: number | null
  installment_schedule: InstallmentScheduleEntry[] | null
  description_template: string | null
  coachees: {
    id: string
    client_id: string
    billing_account_id: string
    clients: { id: string; name: string; email: string | null }
    billing_accounts: AccountRow | null
  }
  billing_accounts: AccountRow
}

type AccountRow = {
  id: string
  name: string
  type: string
  billing_email: string
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Add n months to a YYYY-MM-DD date, clamping to the target month's last day. */
function addMonths(d: string, n: number): string {
  const dt = new Date(d + 'T12:00:00Z')
  const day = dt.getUTCDate()
  dt.setUTCDate(1)
  dt.setUTCMonth(dt.getUTCMonth() + n)
  const lastDay = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate()
  dt.setUTCDate(Math.min(day, lastDay))
  return dt.toISOString().slice(0, 10)
}

/** The YYYY-MM-DD day before the given date. */
function dayBefore(d: string): string {
  const dt = new Date(d + 'T12:00:00Z')
  dt.setUTCDate(dt.getUTCDate() - 1)
  return dt.toISOString().slice(0, 10)
}

function formatDate(d: string): string {
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function formatMonth(d: string): string {
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Build the line description for an arrears coachee group.
 * Enterprise accounts show the client name; solo accounts omit it (only one coachee).
 */
function arrearsLineDescription(
  clientName: string,
  sessions: BillableSession[],
  isEnterprise: boolean,
): string {
  const count = sessions.length
  const dates = sessions.map((s) => formatDate(s.occurred_on)).join(', ')
  const sessionWord = count === 1 ? 'session' : 'sessions'
  if (isEnterprise) {
    return `${count} coaching ${sessionWord} · ${clientName} · ${dates}`
  }
  return `${count} coaching ${sessionWord} · ${dates}`
}

/**
 * Check whether an account already has a non-void invoice covering this exact
 * [periodStart, periodEnd] window. Used to dedup arrears + subscription runs.
 */
async function hasPeriodInvoice(
  supabase: SupabaseClient,
  coachId: string,
  accountId: string,
  periodStart: string,
  periodEnd: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('invoices')
    .select('id')
    .eq('coach_id', coachId)
    .eq('billing_account_id', accountId)
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .neq('status', 'void')
    .limit(1)
    .maybeSingle()
  return !!data
}

/**
 * Count how many engagement_installment lines already exist for a coachee
 * on non-void invoices. Used to determine which installment is next.
 */
async function countExistingInstallmentLines(
  supabase: SupabaseClient,
  coachId: string,
  coacheeId: string,
): Promise<number> {
  const { data } = await supabase
    .from('invoice_lines')
    .select('id, invoices!inner( coach_id, status )')
    .eq('source', 'engagement_installment')
    .eq('coachee_id', coacheeId)
    .eq('invoices.coach_id', coachId)
    .neq('invoices.status', 'void')
  return (data ?? []).length
}

/**
 * Count scheduled/completed appointments for a client in the period.
 * Used to cross-check arrears billing and to warn on idle subscriptions.
 */
async function countCalendarSessions(
  supabase: SupabaseClient,
  coachId: string,
  clientId: string,
  periodStart: string,
  periodEnd: string,
): Promise<number> {
  const start = new Date(periodStart + 'T00:00:00Z').toISOString()
  const end = new Date(periodEnd + 'T23:59:59Z').toISOString()
  const { count } = await supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('coach_id', coachId)
    .in('status', ['scheduled', 'completed'])
    .gte('scheduled_at', start)
    .lte('scheduled_at', end)
    // appointments link to clients via coachees
    .eq('client_id', clientId)
  return count ?? 0
}

// ── Main assembler ────────────────────────────────────────────────────────────

export async function assembleRun(
  supabase: SupabaseClient,
  coachId: string,
  periodStart: string,
  periodEnd: string,
): Promise<RunResult> {
  // Hourly (arrears) clients bill in arrears: their session window is the one
  // month immediately before the cycle. A July 1–31 cycle bills June 1–30
  // sessions. Anything older never surfaces.
  const arrearsStart = addMonths(periodStart, -1)
  const arrearsEnd = dayBefore(periodStart)

  // 1. Load all active, TLW-owned engagements with their coachee + account.
  // The coachee's CURRENT account is fetched too — it wins over the
  // engagement's stored billing_account_id (which can go stale when a client
  // is moved onto an enterprise account after the engagement was created).
  const { data: engagements, error: engErr } = await supabase
    .from('engagements')
    .select(`
      *,
      coachees ( id, client_id, billing_account_id, clients ( id, name, email ), billing_accounts ( id, name, type, billing_email ) ),
      billing_accounts ( id, name, type, billing_email )
    `)
    .eq('coach_id', coachId)
    .eq('status', 'active')
    .eq('billing_owner', 'TLW')

  if (engErr) throw new Error(`assembleRun: failed to load engagements — ${engErr.message}`)
  if (!engagements || engagements.length === 0) {
    return { created: 0, skipped: 0, empty: 0, invoiceIds: [], warnings: [], debug: ['No active TLW-owned engagements found for this coach. Create engagements with billing_owner=TLW and status=active on the Accounts page.'] }
  }

  // 2. Group engagements by the coachee's current billing account.
  const byAccount = new Map<string, EngagementRow[]>()
  const resolveAccountId = (eng: EngagementRow) => eng.coachees?.billing_account_id ?? eng.billing_account_id
  const debug: string[] = []
  for (const eng of engagements as EngagementRow[]) {
    const acctId = resolveAccountId(eng)
    if (acctId !== eng.billing_account_id) {
      const name = eng.coachees?.clients?.name ?? eng.id
      const acctName = eng.coachees?.billing_accounts?.name ?? acctId
      debug.push(`  ${name}: engagement pointed at an older account — rolled up to their current account "${acctName}".`)
    }
    if (!byAccount.has(acctId)) byAccount.set(acctId, [])
    byAccount.get(acctId)!.push(eng)
  }

  let created = 0
  let skipped = 0
  let empty = 0
  const invoiceIds: string[] = []
  const warnings: RunWarning[] = []
  debug.unshift(
    `Billing cycle ${periodStart} → ${periodEnd}: subscriptions bill this cycle in advance; hourly sessions bill from ${arrearsStart} → ${arrearsEnd}.`,
    `Found ${engagements.length} active TLW-owned engagement(s) across ${byAccount.size} account(s).`,
  )

  // 3. Process each account.
  for (const [accountId, acctEngagements] of Array.from(byAccount)) {
    const account =
      acctEngagements[0].coachees?.billing_accounts ?? acctEngagements[0].billing_accounts
    const isEnterprise = account.type === 'enterprise'

    // Lines to build for this invoice.
    type PendingLine = {
      coacheeId: string | null
      description: string
      quantity: number
      unitAmount: number
      amount: number
      source: 'session' | 'subscription' | 'engagement_installment'
      // Sessions to mark billed after invoice creation.
      sessionIds?: string[]
    }
    const lines: PendingLine[] = []

    for (const eng of acctEngagements) {
      const coachee = eng.coachees
      const client = coachee?.clients
      const clientName = client?.name ?? 'Unknown'
      const clientId = coachee?.client_id

      if (eng.skip_billing) {
        debug.push(`  Engagement for ${clientName} skipped: skip_billing is set (lump-sum / not invoiced this period).`)
        continue
      }

      if (eng.billing_mode === 'arrears') {
        if (!clientId || !eng.rate_hourly) {
          debug.push(`  Arrears engagement ${eng.id} skipped: ${!clientId ? 'no client_id on coachee' : 'no rate_hourly set'}.`)
          continue
        }

        const sessions = await deriveBillableSessions(
          supabase,
          {
            id: eng.id,
            coach_id: eng.coach_id,
            coachee_id: eng.coachee_id,
            billing_mode: 'arrears',
            billing_owner: 'TLW',
            rate_hourly: eng.rate_hourly,
          },
          clientId,
          arrearsStart,
          arrearsEnd,
        )

        if (sessions.length === 0) {
          debug.push(`  Hourly engagement for ${clientName}: 0 notes with session_date in [${arrearsStart}, ${arrearsEnd}] (the month before this cycle) and duration_minutes > 0. Check that notes have the correct session_date.`)
          continue
        }

        // Cross-check note-based sessions against calendar appointments.
        if (clientId) {
          const calCount = await countCalendarSessions(supabase, coachId, clientId, arrearsStart, arrearsEnd)
          if (calCount === 0) {
            const detail = `Billing ${sessions.length} session${sessions.length > 1 ? 's' : ''} from notes for ${clientName} but no calendar appointments found in the billed month (${formatMonth(arrearsEnd)}). Verify the session dates are correct.`
            warnings.push({ kind: 'no_calendar_sessions', clientName, detail })
            debug.push(`  ⚠ ${detail}`)
          } else if (calCount !== sessions.length) {
            const detail = `Note-based session count (${sessions.length}) doesn't match calendar appointments (${calCount}) for ${clientName} in ${formatMonth(arrearsEnd)}. Review before approving.`
            warnings.push({ kind: 'no_calendar_sessions', clientName, detail })
            debug.push(`  ⚠ ${detail}`)
          }
        }

        const lineTotal = round2(sessions.reduce((s, sess) => s + sess.amount, 0))
        lines.push({
          coacheeId: eng.coachee_id,
          description: arrearsLineDescription(clientName, sessions, isEnterprise),
          quantity: sessions.length,
          unitAmount: round2(lineTotal / sessions.length),
          amount: lineTotal,
          source: 'session',
          sessionIds: sessions.map((s) => s.id),
        })

      } else if (eng.billing_mode === 'subscription') {
        if (!eng.monthly_amount) {
          debug.push(`  Subscription engagement ${eng.id} skipped: no monthly_amount set.`)
          continue
        }

        // Dedup: skip if this account already has a non-void invoice for this period.
        const alreadyInvoiced = await hasPeriodInvoice(supabase, coachId, accountId, periodStart, periodEnd)
        if (alreadyInvoiced) {
          // Skip the whole account below.
          lines.length = 0
          skipped++
          break
        }

        // Warn if no calendar sessions happened — subscription still bills, but coach should know.
        if (clientId) {
          const calCount = await countCalendarSessions(supabase, coachId, clientId, periodStart, periodEnd)
          if (calCount === 0) {
            const detail = `Subscription invoice for ${clientName} — no calendar sessions found in this period. Confirm coaching occurred before sending.`
            warnings.push({ kind: 'subscription_no_sessions', clientName, detail })
            debug.push(`  ⚠ ${detail}`)
          }
        }

        const desc = eng.description_template
          ? eng.description_template
          : `Monthly coaching · ${clientName} · ${formatMonth(periodEnd)}`

        lines.push({
          coacheeId: eng.coachee_id,
          description: desc,
          quantity: 1,
          unitAmount: eng.monthly_amount,
          amount: eng.monthly_amount,
          source: 'subscription',
        })

      } else if (eng.billing_mode === 'per_engagement') {
        if (!eng.installment_schedule || eng.installment_schedule.length === 0) {
          debug.push(`  Per-engagement ${eng.id} skipped: no installment_schedule.`)
          continue
        }

        const existingCount = await countExistingInstallmentLines(supabase, coachId, eng.coachee_id)
        const totalInstallments = eng.installment_count ?? eng.installment_schedule.length

        // Surface each installment whose due_date ≤ periodEnd and hasn't been invoiced yet.
        for (let i = existingCount; i < eng.installment_schedule.length; i++) {
          const installment = eng.installment_schedule[i]
          if (installment.due_date > periodEnd) continue

          const installmentNum = i + 1
          const desc = eng.description_template
            ? `${eng.description_template} · ${installment.label}`
            : totalInstallments > 1
              ? `Coaching engagement · ${installment.label} (installment ${installmentNum} of ${totalInstallments})`
              : `Coaching engagement · ${clientName}`

          lines.push({
            coacheeId: eng.coachee_id,
            description: desc,
            quantity: 1,
            unitAmount: installment.amount,
            amount: installment.amount,
            source: 'engagement_installment',
          })
          // Only surface one new installment per run per engagement.
          break
        }
      }
    }

    if (lines.length === 0) {
      // Nothing due for this account this period — check if we already skipped above.
      if (!skipped || !invoiceIds.includes(accountId)) empty++
      continue
    }

    // Check period-based dedup for arrears-only accounts (subscription did it inline).
    const hasArrears = lines.some((l) => l.source === 'session')
    if (hasArrears) {
      const alreadyInvoiced = await hasPeriodInvoice(supabase, coachId, accountId, periodStart, periodEnd)
      if (alreadyInvoiced) {
        skipped++
        continue
      }
    }

    // 4. Create the invoice.
    const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0))

    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .insert({
        coach_id: coachId,
        billing_account_id: accountId,
        period_start: periodStart,
        period_end: periodEnd,
        status: 'draft',
        subtotal,
        total: subtotal,
        currency: 'usd',
      })
      .select('id')
      .single()

    if (invErr || !invoice) {
      throw new Error(`assembleRun: failed to create invoice for account ${accountId} — ${invErr?.message}`)
    }

    // 5. Insert lines.
    const lineRows = lines.map((l) => ({
      invoice_id: invoice.id,
      coachee_id: l.coacheeId,
      description: l.description,
      quantity: l.quantity,
      unit_amount: l.unitAmount,
      amount: l.amount,
      source: l.source,
    }))

    const { error: lineErr } = await supabase.from('invoice_lines').insert(lineRows)
    if (lineErr) throw new Error(`assembleRun: failed to insert lines — ${lineErr.message}`)

    // 6. Mark arrears sessions as billed.
    const allSessionIds = lines.flatMap((l) => l.sessionIds ?? [])
    if (allSessionIds.length > 0) {
      const { error: markErr } = await supabase
        .from('billable_sessions')
        .update({ billed_invoice_id: invoice.id })
        .in('id', allSessionIds)
      if (markErr) throw new Error(`assembleRun: failed to mark sessions billed — ${markErr.message}`)
    }

    created++
    invoiceIds.push(invoice.id)
  }

  return { created, skipped, empty, invoiceIds, warnings, debug }
}
