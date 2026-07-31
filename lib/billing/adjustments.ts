/**
 * The ONE adjustment path (§10 / §4.7). No route calls Stripe money-movement
 * APIs directly.
 *
 * Adjustments use Stripe CREDIT NOTES as the primary instrument (with the refund
 * attached), not bare refunds — a credit note reduces the invoice on the record
 * and keeps the QuickBooks connector in sync. `void` cancels a finalized-but-
 * unpaid invoice.
 *
 *   refund            → credit note with refund_amount (money back to card)
 *   credit_to_balance → credit note with credit_amount (applies to next invoice)
 *   void              → invoices.voidInvoice (finalized-but-unpaid only)
 *
 * Guards (§5 / §4.8):
 *   - reason REQUIRED (also enforced server-side at the route).
 *   - amount cannot exceed the amount actually captured, minus prior succeeded
 *     adjustments — checked against Stripe's amount_paid, never the UI.
 *   - claim-before + idempotency key → no double-issue.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createCreditNote,
  voidStripeInvoice,
  invoiceAmountCaptured,
} from './stripe'
import { cancelReminders } from './reminders'
import { sendAdjustmentNotice } from './receipt'
import type { AdjustmentType } from './types'

export type AdjustResult =
  | { ok: true; adjustmentId: string; type: AdjustmentType; amountCents: number }
  | { ok: false; error: string; code?: 'over_amount' | 'not_allowed' | 'reason_required' | 'stripe' | 'duplicate' }

type CoachRow = { email: string; name: string; google_refresh_token: string | null }

export async function createAdjustment(
  supabase: SupabaseClient,
  coachId: string,
  invoiceId: string,
  byEmail: string,
  input: { type: AdjustmentType; amountCents: number; reason: string },
): Promise<AdjustResult> {
  const reason = (input.reason ?? '').trim()
  if (!reason) return { ok: false, error: 'A reason is required.', code: 'reason_required' }

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, status, total, currency, stripe_invoice_id, billing_account_id, period_start, period_end, billing_accounts ( id, name, billing_email, billing_cc, payment_method_brand, payment_method_last4 )')
    .eq('id', invoiceId)
    .eq('coach_id', coachId)
    .maybeSingle()
  if (!invoice) return { ok: false, error: 'Invoice not found.' }
  const inv = invoice as any
  const account = inv.billing_accounts
  const currency: string = inv.currency ?? 'usd'

  // ── void: finalized-but-unpaid only ──────────────────────────────────────────
  if (input.type === 'void') {
    if (!['sent', 'overdue', 'failed', 'approved'].includes(inv.status) || !inv.stripe_invoice_id) {
      return { ok: false, error: 'Only a finalized, unpaid invoice can be voided.', code: 'not_allowed' }
    }
  } else {
    // refund / credit_to_balance require a paid invoice with a Stripe id.
    if (inv.status !== 'paid' || !inv.stripe_invoice_id) {
      return { ok: false, error: 'Only a paid invoice can be refunded or credited.', code: 'not_allowed' }
    }
    if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
      return { ok: false, error: 'Enter an amount greater than zero.' }
    }
    // Over-amount guard — captured minus prior succeeded adjustments.
    let captured = 0
    try {
      captured = await invoiceAmountCaptured(inv.stripe_invoice_id)
    } catch {
      return { ok: false, error: 'Could not verify the paid amount with Stripe. Try again.', code: 'stripe' }
    }
    const { data: prior } = await supabase
      .from('invoice_adjustments')
      .select('amount_cents, type, status')
      .eq('invoice_id', invoiceId)
      .in('type', ['refund', 'credit_to_balance'])
      .eq('status', 'succeeded')
    const priorTotal = (prior ?? []).reduce((s: number, a: any) => s + (a.amount_cents ?? 0), 0)
    if (input.amountCents > captured - priorTotal) {
      return {
        ok: false,
        code: 'over_amount',
        error: `That exceeds what's available to adjust. Captured ${money(captured, currency)}, already adjusted ${money(priorTotal, currency)}.`,
      }
    }
  }

  // ── Claim before Stripe (idempotency) ────────────────────────────────────────
  const { count } = await supabase
    .from('invoice_adjustments')
    .select('id', { count: 'exact', head: true })
    .eq('invoice_id', invoiceId)
  const seq = (count ?? 0) + 1
  const idempotencyKey = `adj_${invoiceId}_${seq}`

  const { data: claimed, error: claimErr } = await supabase
    .from('invoice_adjustments')
    .insert({
      invoice_id: invoiceId,
      billing_account_id: inv.billing_account_id,
      coach_id: coachId,
      type: input.type,
      amount_cents: input.type === 'void' ? Math.round(inv.total * 100) : input.amountCents,
      reason,
      idempotency_key: idempotencyKey,
      status: 'pending',
      created_by_email: byEmail,
    } as any)
    .select('id, amount_cents')
    .maybeSingle()

  if (claimErr || !claimed) {
    return { ok: false, error: 'This adjustment is already being processed.', code: 'duplicate' }
  }
  const adjustmentId = (claimed as any).id
  const amountCents = (claimed as any).amount_cents

  // ── Execute in Stripe ────────────────────────────────────────────────────────
  try {
    if (input.type === 'void') {
      await voidStripeInvoice(inv.stripe_invoice_id, `${idempotencyKey}_stripe`)
      const now = new Date().toISOString()
      await supabase.from('invoices').update({ status: 'void', voided_at: now, updated_at: now } as any).eq('id', invoiceId)
      await cancelReminders(supabase, invoiceId).catch(() => {})
    } else {
      const cn = await createCreditNote({
        stripeInvoiceId: inv.stripe_invoice_id,
        amountCents,
        kind: input.type,
        memo: reason,
        idempotencyKey: `${idempotencyKey}_stripe`,
      })
      // At the pinned API version (2023-10-16) a credit note carries a single
      // `refund` id; newer typings expose `refunds`. Read both defensively.
      const cnAny = cn as any
      const refundId: string | null =
        (typeof cnAny.refund === 'string' ? cnAny.refund : cnAny.refund?.id) ??
        cnAny.refunds?.data?.[0]?.id ??
        null
      await supabase
        .from('invoice_adjustments')
        .update({ stripe_credit_note_id: cn.id, stripe_refund_id: refundId } as any)
        .eq('id', adjustmentId)
      await bumpDenormTotals(supabase, invoiceId, input.type, amountCents)
    }

    await supabase.from('invoice_adjustments').update({ status: 'succeeded' } as any).eq('id', adjustmentId)

    // Client notice — best-effort; an email failure never un-records the adjustment.
    if (account) {
      const { data: coach } = await supabase.from('coaches').select('email, name, google_refresh_token').eq('id', coachId).maybeSingle()
      if (coach) {
        const r = await sendAdjustmentNotice(supabase, coach as CoachRow, coachId, account, {
          type: input.type,
          amount_cents: amountCents,
          currency,
          brandLast4: account.payment_method_brand && account.payment_method_last4 ? `${account.payment_method_brand} ending ${account.payment_method_last4}` : null,
        }).catch(() => ({ sent: false, communicationId: null }))
        await supabase
          .from('invoice_adjustments')
          .update({ notified_at: new Date().toISOString(), communication_id: r.communicationId } as any)
          .eq('id', adjustmentId)
          .then(() => {}, () => {})
      }
    }

    return { ok: true, adjustmentId, type: input.type, amountCents }
  } catch (e: any) {
    await supabase
      .from('invoice_adjustments')
      .update({ status: 'failed', failure_message: e?.message ?? 'Stripe error' } as any)
      .eq('id', adjustmentId)
    return { ok: false, error: e?.message ?? 'Stripe error', code: 'stripe' }
  }
}

async function bumpDenormTotals(supabase: SupabaseClient, invoiceId: string, type: AdjustmentType, amountCents: number) {
  const { data: inv } = await supabase.from('invoices').select('refunded_cents, credited_cents').eq('id', invoiceId).maybeSingle()
  const cur = inv as any
  const patch =
    type === 'refund'
      ? { refunded_cents: (cur?.refunded_cents ?? 0) + amountCents }
      : { credited_cents: (cur?.credited_cents ?? 0) + amountCents }
  await supabase.from('invoices').update({ ...patch, updated_at: new Date().toISOString() } as any).eq('id', invoiceId)
}

function money(cents: number, currency: string): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: currency.toUpperCase() })
}
