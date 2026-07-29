/**
 * Billing maintenance sweep — driven by the hourly cron GET /api/cron/billing-retries.
 *
 * Three jobs (§7 Phase 4 + §4.3):
 *   1. Retries      — fire any invoice whose charge_retry_at has passed, capped
 *                     at 2 automatic retries (hard stop → "Needs attention").
 *   2. Dormancy     — mark an active card dormant once its account has no active
 *                     engagement (engagement closed; card retained for a return).
 *   3. Auto-detach  — remove a card untouched for 24 months (§4.3 inactivity).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { chargeInvoice } from './charge'
import { detachPaymentMethod } from './stripe'
import { logAuthorizationEvent, setPaymentMethodStatus } from './payment-methods'

// 1 initial charge + 2 automatic retries = attempt_count 3 is the hard stop.
const MAX_TOTAL_ATTEMPTS = 3

export async function runBillingMaintenance(supabase: SupabaseClient): Promise<{
  retried: number
  retryStopped: number
  markedDormant: number
  autoDetached: number
}> {
  const now = new Date()
  const nowIso = now.toISOString()
  let retried = 0
  let retryStopped = 0
  let markedDormant = 0
  let autoDetached = 0

  // ── 1. Due retries ────────────────────────────────────────────────────────
  const { data: dueRetries } = await supabase
    .from('invoices')
    .select('id, coach_id, charge_attempt_count')
    .eq('charge_status', 'failed')
    .neq('status', 'paid')
    .lte('charge_retry_at', nowIso)
    .not('charge_retry_at', 'is', null)

  for (const row of (dueRetries ?? []) as any[]) {
    // Consume the scheduled retry first so a slow charge can't double-fire.
    await supabase.from('invoices').update({ charge_retry_at: null, updated_at: nowIso } as any).eq('id', row.id)

    if ((row.charge_attempt_count ?? 0) >= MAX_TOTAL_ATTEMPTS) {
      retryStopped++
      continue
    }
    const { data: coach } = await supabase
      .from('coaches')
      .select('email, name, google_refresh_token, billing_settings')
      .eq('id', row.coach_id)
      .maybeSingle()
    if (!coach) continue
    const res = await chargeInvoice(supabase, row.coach_id, row.id, coach as any).catch(() => null)
    if (res?.ok) retried++
    else retryStopped++
  }

  // ── 2. Dormancy: active card, account has no active engagement ─────────────
  const { data: activeCards } = await supabase
    .from('billing_accounts')
    .select('id, coach_id, engagements ( status )')
    .eq('payment_method_status', 'active')

  for (const acct of (activeCards ?? []) as any[]) {
    const engagements = (acct.engagements ?? []) as { status: string }[]
    if (engagements.length === 0) continue // nothing has closed yet
    const hasActive = engagements.some((e) => e.status === 'active')
    if (!hasActive) {
      await setPaymentMethodStatus(supabase, acct.id, 'dormant', { dormant_at: nowIso })
      await logAuthorizationEvent(supabase, { billingAccountId: acct.id, coachId: acct.coach_id, event: 'marked_dormant' })
      markedDormant++
    }
  }

  // ── 3. Auto-detach after 24 months of inactivity ──────────────────────────
  const cutoff = new Date(now)
  cutoff.setFullYear(cutoff.getFullYear() - 2)
  const cutoffIso = cutoff.toISOString()

  const { data: staleCards } = await supabase
    .from('billing_accounts')
    .select('id, coach_id, stripe_payment_method_id, last_charge_at, authorized_at')
    .in('payment_method_status', ['active', 'dormant'])

  for (const acct of (staleCards ?? []) as any[]) {
    const lastActivity = acct.last_charge_at ?? acct.authorized_at
    if (!lastActivity || lastActivity > cutoffIso) continue
    if (acct.stripe_payment_method_id) {
      await detachPaymentMethod(acct.stripe_payment_method_id).catch(() => {})
    }
    await setPaymentMethodStatus(supabase, acct.id, 'removed', {
      stripe_payment_method_id: null,
      payment_method_brand: null,
      payment_method_last4: null,
      payment_method_exp_month: null,
      payment_method_exp_year: null,
    })
    await logAuthorizationEvent(supabase, { billingAccountId: acct.id, coachId: acct.coach_id, event: 'auto_detached' })
    autoDetached++
  }

  return { retried, retryStopped, markedDormant, autoDetached }
}
