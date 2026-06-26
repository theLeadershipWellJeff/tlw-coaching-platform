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
 * Mode logic:
 *  arrears        → pull unbilled delivered sessions in the period, one line
 *                   per coachee (grouped, with dates), per-coachee for
 *                   enterprise; one grouped line for solo.
 *  subscription   → re-draw a flat monthly line at engagement.monthly_amount.
 *                   Deduped against existing invoices for the period.
 *  per_engagement → surface any installment whose due_date ≤ periodEnd that
 *                   hasn't already been invoiced (tracked via
 *                   invoice_lines for the coachee + source).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { deriveBillableSessions } from './sessions'
import type { BillableSession, InstallmentScheduleEntry } from './types'

export type RunResult = {
  created: number     // new draft invoices assembled
  skipped: number     // accounts skipped (already invoiced for period)
  empty: number       // accounts with nothing due
  invoiceIds: string[]
}

type EngagementRow = {
  id: string
  coach_id: string
  billing_account_id: string
  coachee_id: string
  billing_mode: string
  billing_owner: string
  status: string
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
    clients: { id: string; name: string; email: string | null }
  }
  billing_accounts: {
    id: string
    name: string
    type: string
    billing_email: string
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
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

// ── Main assembler ────────────────────────────────────────────────────────────

export async function assembleRun(
  supabase: SupabaseClient,
  coachId: string,
  periodStart: string,
  periodEnd: string,
): Promise<RunResult> {
  // 1. Load all active, TLW-owned engagements with their coachee + account.
  const { data: engagements, error: engErr } = await supabase
    .from('engagements')
    .select(`
      *,
      coachees ( id, client_id, clients ( id, name, email ) ),
      billing_accounts ( id, name, type, billing_email )
    `)
    .eq('coach_id', coachId)
    .eq('status', 'active')
    .eq('billing_owner', 'TLW')

  if (engErr) throw new Error(`assembleRun: failed to load engagements — ${engErr.message}`)
  if (!engagements || engagements.length === 0) {
    return { created: 0, skipped: 0, empty: 0, invoiceIds: [] }
  }

  // 2. Group engagements by billing account.
  const byAccount = new Map<string, EngagementRow[]>()
  for (const eng of engagements as EngagementRow[]) {
    const acctId = eng.billing_account_id
    if (!byAccount.has(acctId)) byAccount.set(acctId, [])
    byAccount.get(acctId)!.push(eng)
  }

  let created = 0
  let skipped = 0
  let empty = 0
  const invoiceIds: string[] = []

  // 3. Process each account.
  for (const [accountId, acctEngagements] of Array.from(byAccount)) {
    const account = acctEngagements[0].billing_accounts
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

      if (eng.billing_mode === 'arrears') {
        if (!clientId || !eng.rate_hourly) continue

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
          periodStart,
          periodEnd,
        )

        if (sessions.length === 0) continue

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
        if (!eng.monthly_amount) continue

        // Dedup: skip if this account already has a non-void invoice for this period.
        const alreadyInvoiced = await hasPeriodInvoice(supabase, coachId, accountId, periodStart, periodEnd)
        if (alreadyInvoiced) {
          // Skip the whole account below.
          lines.length = 0
          skipped++
          break
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
        if (!eng.installment_schedule || eng.installment_schedule.length === 0) continue

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

  return { created, skipped, empty, invoiceIds }
}
