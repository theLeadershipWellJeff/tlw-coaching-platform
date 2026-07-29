/**
 * The ONE charge path (§10). No route calls Stripe money-movement APIs directly.
 *
 * chargeInvoice() charges a stored card on file for an invoice inside the billing
 * run. It is protected by two idempotency guards (§4.8):
 *
 *   1. Claim-before-charge — an invoice_charge_attempts row (unique on
 *      (invoice_id, attempt_number)) is inserted BEFORE any Stripe call. A
 *      double-click / duplicated request loses the claim and returns the first
 *      attempt's state instead of charging twice.
 *   2. Stripe idempotency key — derived from invoice_id + attempt_number, passed
 *      on finalize and pay so Stripe collapses duplicate requests.
 *
 * Draft-until-charge (§4.5): the Stripe invoice is created charge_automatically
 * and finalized only HERE, at the moment of charge — never earlier.
 *
 * Preconditions (all backstops; the run UI already gates on them):
 *   - agreement gate (§4.2): every client on the account has an agreement on
 *     file. On failure the charge is refused and the normal invoice is sent.
 *   - payment method status must be 'active'.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getStripe } from './stripe'
import { accountPassesAgreementGate } from './payment-methods'
import { sendInvoice } from './send'
import { sendPaymentReceipt } from './receipt'
import { cancelReminders } from './reminders'

export type ChargeResult =
  | { ok: true; status: 'paid'; alreadyCharged?: boolean }
  | { ok: false; status: 'action_required'; message: string }
  | { ok: false; status: 'no_agreement'; invoiceSent: boolean; message: string }
  | { ok: false; status: 'failed'; code: string | null; message: string }
  | { ok: false; status: 'error'; message: string }

type CoachRow = { email: string; name: string; google_refresh_token: string | null; billing_settings?: any }

export async function chargeInvoice(
  supabase: SupabaseClient,
  coachId: string,
  invoiceId: string,
  coach: CoachRow,
): Promise<ChargeResult> {
  // 1. Load invoice + lines + account.
  const { data: invoice, error: fetchErr } = await supabase
    .from('invoices')
    .select(`
      *,
      billing_accounts ( id, name, type, billing_email, billing_cc, stripe_customer_id, stripe_payment_method_id, payment_method_status ),
      invoice_lines ( id, description, quantity, unit_amount, amount, source, coachee_id )
    `)
    .eq('id', invoiceId)
    .eq('coach_id', coachId)
    .maybeSingle()

  if (fetchErr) return { ok: false, status: 'error', message: `db error — ${fetchErr.message}` }
  if (!invoice) return { ok: false, status: 'error', message: 'invoice not found' }

  const inv = invoice as any
  if (inv.status === 'paid') return { ok: true, status: 'paid', alreadyCharged: true }
  if (!['draft', 'approved', 'failed'].includes(inv.status)) {
    return { ok: false, status: 'error', message: `invoice cannot be charged from status '${inv.status}'` }
  }

  const account = inv.billing_accounts
  const lines: any[] = inv.invoice_lines ?? []
  if (!account) return { ok: false, status: 'error', message: 'no billing account' }
  if (lines.length === 0) return { ok: false, status: 'error', message: 'invoice has no lines' }

  // Payment-method precondition.
  if (account.payment_method_status !== 'active' || !account.stripe_payment_method_id) {
    return { ok: false, status: 'error', message: 'no active card on file for this account' }
  }

  // Agreement gate backstop — refuse the charge and send the invoice instead.
  const gate = await accountPassesAgreementGate(supabase, account.id)
  if (!gate.ok) {
    let invoiceSent = false
    try {
      // sendInvoice requires status 'approved'; approve first if needed.
      if (inv.status !== 'approved') {
        await supabase.from('invoices').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', invoiceId)
      }
      const res = await sendInvoice(supabase, coachId, invoiceId, coach)
      invoiceSent = res.ok
    } catch { /* fall through */ }
    return {
      ok: false,
      status: 'no_agreement',
      invoiceSent,
      message: 'No signed agreement on file — the charge was refused and a normal invoice was sent instead.',
    }
  }

  // 2. Claim before charge (idempotency).
  const attemptNumber = (inv.charge_attempt_count ?? 0) + 1
  const idempotencyKey = `charge_${invoiceId}_${attemptNumber}`
  const { error: claimErr } = await supabase.from('invoice_charge_attempts').insert({
    invoice_id: invoiceId,
    attempt_number: attemptNumber,
    idempotency_key: idempotencyKey,
    status: 'claimed',
  } as any)
  if (claimErr) {
    // Unique violation → a concurrent request already claimed this attempt.
    // Return the current invoice state rather than charging again.
    const { data: latest } = await supabase.from('invoices').select('status, charge_status, charge_failure_message').eq('id', invoiceId).maybeSingle()
    const l = latest as any
    if (l?.status === 'paid') return { ok: true, status: 'paid', alreadyCharged: true }
    if (l?.charge_status === 'action_required') return { ok: false, status: 'action_required', message: 'Authentication required — invoice sent.' }
    return { ok: false, status: 'failed', code: null, message: l?.charge_failure_message ?? 'A charge is already in progress for this invoice.' }
  }

  const now = new Date().toISOString()
  await supabase
    .from('invoices')
    .update({ charge_attempt_count: attemptNumber, charge_attempted_at: now, collection_method: 'charge_automatically', updated_at: now } as any)
    .eq('id', invoiceId)

  const stripe = getStripe()
  const currency = inv.currency ?? 'usd'
  const customerId = account.stripe_customer_id

  try {
    // 3. Create the Stripe invoice charge_automatically (draft until finalize).
    const stripeInvoice = await stripe.invoices.create(
      {
        customer: customerId,
        currency,
        collection_method: 'charge_automatically',
        description: inv.client_message ?? undefined,
        metadata: { tlw_invoice_id: invoiceId, coach_id: coachId },
        default_payment_method: account.stripe_payment_method_id,
      },
      { idempotencyKey: `${idempotencyKey}_inv` },
    )

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      await stripe.invoiceItems.create(
        {
          customer: customerId,
          invoice: stripeInvoice.id,
          amount: Math.round(l.amount * 100),
          currency,
          description: l.description,
        },
        { idempotencyKey: `${idempotencyKey}_item_${i}` },
      )
    }

    await stripe.invoices.finalizeInvoice(stripeInvoice.id, undefined, { idempotencyKey: `${idempotencyKey}_final` })

    await supabase.from('invoices').update({ stripe_invoice_id: stripeInvoice.id, updated_at: new Date().toISOString() } as any).eq('id', invoiceId)

    // 4. Charge off-session.
    const paid = await stripe.invoices.pay(
      stripeInvoice.id,
      { off_session: true },
      { idempotencyKey: `${idempotencyKey}_pay` },
    )

    if (paid.status === 'paid') {
      await resolveAttempt(supabase, invoiceId, attemptNumber, 'succeeded', { stripePaymentIntentId: piId(paid) })
      await markPaid(supabase, coachId, invoiceId, account, inv, coach)
      return { ok: true, status: 'paid' }
    }

    // Not paid and didn't throw → treat as requiring action (rare).
    await handleActionRequiredCharge(supabase, invoiceId, stripeInvoice.id)
    await resolveAttempt(supabase, invoiceId, attemptNumber, 'failed', { failureCode: 'action_required', failureMessage: 'Authentication required' })
    return { ok: false, status: 'action_required', message: 'Authentication required — invoice sent for the client to complete payment.' }
  } catch (e: any) {
    const code = e?.code ?? e?.decline_code ?? null

    // 3DS / SCA → auto-fallback to the hosted invoice, no coach action (§4.6).
    if (code === 'authentication_required') {
      const stripeInvId = e?.raw?.invoice ?? null
      await handleActionRequiredCharge(supabase, invoiceId, stripeInvId)
      await resolveAttempt(supabase, invoiceId, attemptNumber, 'failed', { failureCode: code, failureMessage: 'Authentication required' })
      return { ok: false, status: 'action_required', message: 'Authentication required — invoice sent for the client to complete payment.' }
    }

    const message = readable(e)
    await supabase
      .from('invoices')
      .update({
        status: 'failed',
        charge_status: 'failed',
        charge_failure_code: code,
        charge_failure_message: message,
        stripe_error: message,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', invoiceId)
    await resolveAttempt(supabase, invoiceId, attemptNumber, 'failed', { failureCode: code, failureMessage: message })
    return { ok: false, status: 'failed', code, message }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function piId(inv: any): string | null {
  const pi = inv.payment_intent
  return typeof pi === 'string' ? pi : pi?.id ?? null
}

async function resolveAttempt(
  supabase: SupabaseClient,
  invoiceId: string,
  attemptNumber: number,
  status: 'succeeded' | 'failed',
  extra: { stripePaymentIntentId?: string | null; failureCode?: string | null; failureMessage?: string | null } = {},
) {
  await supabase
    .from('invoice_charge_attempts')
    .update({
      status,
      stripe_payment_intent_id: extra.stripePaymentIntentId ?? null,
      failure_code: extra.failureCode ?? null,
      failure_message: extra.failureMessage ?? null,
      resolved_at: new Date().toISOString(),
    } as any)
    .eq('invoice_id', invoiceId)
    .eq('attempt_number', attemptNumber)
}

/**
 * Flip our invoice to paid ONCE (guarded), then fire receipt + cancel reminders
 * + stamp last_charge_at. The webhook invoice.paid backstop no-ops because
 * status is already 'paid'. Receipt guarded by receipt_sent_at.
 */
async function markPaid(
  supabase: SupabaseClient,
  coachId: string,
  invoiceId: string,
  account: any,
  inv: any,
  coach: CoachRow,
) {
  const now = new Date().toISOString()
  const { data: updated } = await supabase
    .from('invoices')
    .update({ status: 'paid', charge_status: 'succeeded', paid_at: now, stripe_error: null, charge_failure_code: null, charge_failure_message: null, updated_at: now } as any)
    .eq('id', invoiceId)
    .neq('status', 'paid')
    .neq('status', 'void')
    .select('id, receipt_sent_at, stripe_invoice_id, total, currency, period_start, period_end')
    .maybeSingle()
  if (!updated) return // already paid elsewhere

  await supabase.from('billing_accounts').update({ last_charge_at: now, updated_at: now } as any).eq('id', account.id).then(() => {}, () => {})
  await cancelReminders(supabase, invoiceId).catch(() => {})

  const u = updated as any
  if (!u.receipt_sent_at) {
    const r = await sendPaymentReceipt(supabase, coach, coachId, account, {
      total: u.total,
      currency: u.currency,
      period_start: u.period_start,
      period_end: u.period_end,
      stripe_invoice_id: u.stripe_invoice_id,
    }).catch(() => ({ sent: false, communicationId: null }))
    await supabase
      .from('invoices')
      .update({ receipt_sent_at: new Date().toISOString(), receipt_communication_id: r.communicationId } as any)
      .eq('id', invoiceId)
      .then(() => {}, () => {})
  }
}

/** action_required: stamp charge_status + auto-send the hosted invoice once (§4.6). */
async function handleActionRequiredCharge(supabase: SupabaseClient, invoiceId: string, stripeInvoiceId: string | null) {
  const now = new Date().toISOString()
  await supabase
    .from('invoices')
    .update({ status: 'sent', charge_status: 'action_required', fallback_invoice_sent_at: now, updated_at: now } as any)
    .eq('id', invoiceId)
  if (stripeInvoiceId) {
    try {
      await getStripe().invoices.sendInvoice(stripeInvoiceId)
    } catch { /* Stripe emails on action_required anyway */ }
  }
}

function readable(e: any): string {
  const code = e?.decline_code ?? e?.code ?? ''
  const map: Record<string, string> = {
    insufficient_funds: 'The card has insufficient funds.',
    card_declined: 'The card was declined by the issuer.',
    expired_card: 'The card on file has expired.',
    incorrect_cvc: 'The card security code was incorrect.',
    processing_error: 'A processing error occurred — try again shortly.',
  }
  return map[code] || e?.message || 'The card was declined.'
}
