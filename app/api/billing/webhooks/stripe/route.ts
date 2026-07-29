/**
 * POST /api/billing/webhooks/stripe
 *
 * Stripe webhook handler. Validates the signature using STRIPE_WEBHOOK_SECRET,
 * then syncs invoice/payment state back into our tables.
 *
 * Events handled:
 *   invoice.paid                        → paid (once) + receipt (card-on-file) or thank-you (hosted)
 *   invoice.payment_failed              → status/charge_status = failed, warning row (Phase 4)
 *   invoice.payment_action_required     → charge_status = action_required, auto-send hosted invoice (§4.6)
 *   payment_intent.succeeded            → paid (once), fallback resolution
 *   payment_intent.payment_failed       → failed
 *   setup_intent.succeeded              → attach card, set default, status → active (Phase 1)
 *   setup_intent.setup_failed           → log event, leave 'none', notify coach
 *   payment_method.automatically_updated→ refresh stored card display fields
 *   credit_note.created                 → reconcile invoice_adjustments + denorm totals (Phase 5)
 *   charge.refunded                     → confirm refund settled
 *   charge.dispute.created              → log 'charge_disputed', surface loudly
 *
 * All events matched to our records via metadata (tlw_invoice_id /
 * tlw_billing_account_id) or a stored Stripe id. Unknown types return 200.
 *
 * Set up in Stripe Dashboard (endpoint https://theleadershipwell.online/api/billing/webhooks/stripe):
 *   invoice.paid, invoice.payment_failed, invoice.payment_action_required,
 *   payment_intent.succeeded, payment_intent.payment_failed,
 *   setup_intent.succeeded, setup_intent.setup_failed,
 *   payment_method.automatically_updated, credit_note.created, charge.refunded,
 *   charge.dispute.created
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import {
  constructWebhookEvent,
  attachPaymentMethodAsDefault,
  retrievePaymentMethod,
  cardDisplayFields,
} from '@/lib/billing/stripe'
import { cancelReminders } from '@/lib/billing/reminders'
import { sendPaymentThankYou } from '@/lib/billing/send'
import { sendPaymentReceipt } from '@/lib/billing/receipt'
import {
  recordAuthorization,
  refreshCardDisplay,
  logAuthorizationEvent,
} from '@/lib/billing/payment-methods'
import { sendCoachHtmlEmail } from '@/lib/gmail'
import type Stripe from 'stripe'

export const runtime = 'nodejs'

type Admin = ReturnType<typeof getSupabaseAdmin>

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })

  let event: Stripe.Event
  try {
    const rawBody = await req.text()
    event = constructWebhookEvent(rawBody, signature, secret)
  } catch (e: any) {
    return NextResponse.json({ error: `Webhook signature verification failed: ${e.message}` }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const now = new Date().toISOString()

  // Best-effort after signature verification — always 200 so Stripe stops retrying.
  try {
    switch (event.type) {
      case 'invoice.paid': {
        const inv = event.data.object as Stripe.Invoice
        const tlwId = inv.metadata?.tlw_invoice_id ?? (await resolveTlwId(supabase, inv.id))
        if (tlwId) await handlePaidTransition(supabase, tlwId, now, (inv as any).hosted_invoice_url ?? null)
        break
      }

      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice
        const tlwId = inv.metadata?.tlw_invoice_id ?? (await resolveTlwId(supabase, inv.id))
        if (tlwId) await handleChargeFailed(supabase, tlwId, (inv as any).last_payment_error, now)
        break
      }

      case 'invoice.payment_action_required': {
        const inv = event.data.object as Stripe.Invoice
        const tlwId = inv.metadata?.tlw_invoice_id ?? (await resolveTlwId(supabase, inv.id))
        if (tlwId) await handleActionRequired(supabase, tlwId, inv, now)
        break
      }

      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent
        const tlwId = pi.metadata?.tlw_invoice_id ?? (await resolveTlwId(supabase, (pi as any).invoice))
        if (tlwId) await handlePaidTransition(supabase, tlwId, now, null)
        break
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent
        const tlwId = pi.metadata?.tlw_invoice_id ?? (await resolveTlwId(supabase, (pi as any).invoice))
        if (tlwId) await handleChargeFailed(supabase, tlwId, pi.last_payment_error, now)
        break
      }

      case 'setup_intent.succeeded': {
        await handleSetupSucceeded(supabase, event.data.object as Stripe.SetupIntent, req)
        break
      }

      case 'setup_intent.setup_failed': {
        await handleSetupFailed(supabase, event.data.object as Stripe.SetupIntent)
        break
      }

      case 'payment_method.automatically_updated': {
        await handleCardUpdated(supabase, event.data.object as Stripe.PaymentMethod)
        break
      }

      case 'credit_note.created': {
        await handleCreditNoteCreated(supabase, event.data.object as Stripe.CreditNote)
        break
      }

      case 'charge.refunded': {
        await handleChargeRefunded(supabase, event.data.object as Stripe.Charge)
        break
      }

      case 'charge.dispute.created': {
        await handleDisputeCreated(supabase, event.data.object as Stripe.Dispute)
        break
      }

      default:
        break
    }
  } catch (e: any) {
    console.error(`Stripe webhook handler error (${event.type}):`, e)
  }

  return NextResponse.json({ received: true })
}

// ── Resolve our invoice id from a Stripe invoice id ─────────────────────────────
async function resolveTlwId(supabase: Admin, stripeInvoiceId: string | null | undefined): Promise<string | null> {
  if (!stripeInvoiceId) return null
  const { data } = await supabase.from('invoices').select('id').eq('stripe_invoice_id', stripeInvoiceId).maybeSingle()
  return (data as any)?.id ?? null
}

// ── Paid transition (idempotent) ────────────────────────────────────────────────
async function handlePaidTransition(supabase: Admin, tlwInvoiceId: string, now: string, hostedUrl: string | null) {
  const { data: updated } = (await supabase
    .from('invoices')
    .update({ status: 'paid', paid_at: now, stripe_error: null, charge_status: 'succeeded', updated_at: now } as any)
    .eq('id', tlwInvoiceId)
    // Transition from any non-terminal status. Hosted invoices arrive as
    // 'sent'/'overdue'/'failed'; a card-on-file charge arrives as 'approved'
    // (or 'draft') if charge.ts crashed after Stripe took payment — this is the
    // backstop. 'paid'/'void' are excluded so echoes no-op (exactly one receipt).
    .neq('status', 'paid')
    .neq('status', 'void')
    .select('coach_id, total, currency, period_start, period_end, collection_method, stripe_invoice_id, billing_account_id, receipt_sent_at, billing_accounts ( id, name, billing_email, billing_cc )')
    .maybeSingle()) as { data: any | null }

  // Null = already paid (a prior event / manual mark-paid). Skip.
  if (!updated) return

  await cancelReminders(supabase, tlwInvoiceId).catch(() => {})

  const { data: coach } = (await supabase
    .from('coaches')
    .select('email, name, google_refresh_token, billing_settings')
    .eq('id', updated.coach_id)
    .maybeSingle()) as { data: any | null }
  if (!coach) return

  const account = updated.billing_accounts

  // A card-on-file charge stamps last_charge_at and sends the branded RECEIPT
  // (paid PDF attached). A hosted-invoice payment keeps the existing thank-you.
  if (updated.collection_method === 'charge_automatically') {
    if (account?.id) {
      await supabase
        .from('billing_accounts')
        .update({ last_charge_at: now, updated_at: now } as any)
        .eq('id', account.id)
        .then(() => {}, () => {})
    }
    if (account && !updated.receipt_sent_at) {
      sendPaymentReceipt(supabase, coach, updated.coach_id, account, {
        total: updated.total,
        currency: updated.currency,
        period_start: updated.period_start,
        period_end: updated.period_end,
        stripe_invoice_id: updated.stripe_invoice_id,
      })
        .then((r) =>
          supabase
            .from('invoices')
            .update({ receipt_sent_at: new Date().toISOString(), receipt_communication_id: r.communicationId } as any)
            .eq('id', tlwInvoiceId),
        )
        .catch(() => {})
    }
  } else if (account) {
    sendPaymentThankYou(supabase, coach, updated.coach_id, account, {
      total: updated.total,
      currency: updated.currency,
      period_start: updated.period_start,
      period_end: updated.period_end,
    }).catch(() => {})
  }

  sendPaidNotificationToCoach(coach, account, updated.total, updated.currency, hostedUrl).catch(() => {})
}

// ── Charge failed (Phase 4) ─────────────────────────────────────────────────────
async function handleChargeFailed(supabase: Admin, tlwInvoiceId: string, lastErr: any, now: string) {
  const code = lastErr?.code ?? lastErr?.decline_code ?? null
  const msg = readableDecline(lastErr)

  const { data: inv } = (await supabase
    .from('invoices')
    .update({
      status: 'failed',
      charge_status: 'failed',
      charge_failure_code: code,
      charge_failure_message: msg,
      stripe_error: msg,
      updated_at: now,
    } as any)
    .eq('id', tlwInvoiceId)
    .select('coach_id, billing_account_id, period_start, period_end, billing_accounts ( name )')
    .maybeSingle()) as { data: any | null }

  if (!inv) return

  // Raise a billing_run_warnings row so the failure surfaces in the run.
  await supabase
    .from('billing_run_warnings')
    .insert({
      coach_id: inv.coach_id,
      engagement_id: null,
      invoice_id: tlwInvoiceId,
      kind: 'charge_failed',
      period_start: inv.period_start ?? now.slice(0, 10),
      period_end: inv.period_end ?? now.slice(0, 10),
      detail: `Card charge failed for ${inv.billing_accounts?.name ?? 'account'}: ${msg}`,
    } as any)
    .then(() => {}, () => {})
}

// ── Authentication required → auto-fallback to hosted invoice (§4.6) ────────────
async function handleActionRequired(supabase: Admin, tlwInvoiceId: string, stripeInv: Stripe.Invoice, now: string) {
  const { data: inv } = (await supabase
    .from('invoices')
    .select('id, charge_status, fallback_invoice_sent_at, stripe_invoice_id')
    .eq('id', tlwInvoiceId)
    .maybeSingle()) as { data: any | null }
  if (!inv) return

  await supabase
    .from('invoices')
    .update({ charge_status: 'action_required', updated_at: now } as any)
    .eq('id', tlwInvoiceId)

  // Auto-send the already-finalized hosted invoice ONCE, so the client can
  // authenticate + pay themselves. No coach action, no off-session retry.
  if (!inv.fallback_invoice_sent_at && inv.stripe_invoice_id) {
    try {
      const { getStripe } = await import('@/lib/billing/stripe')
      await getStripe().invoices.sendInvoice(inv.stripe_invoice_id)
    } catch { /* Stripe already emails on action_required; stamp regardless */ }
    await supabase
      .from('invoices')
      .update({ fallback_invoice_sent_at: now, updated_at: now } as any)
      .eq('id', tlwInvoiceId)
      .is('fallback_invoice_sent_at', null)
  }
}

// ── Setup intent succeeded → attach + activate (Phase 1) ────────────────────────
async function handleSetupSucceeded(supabase: Admin, si: Stripe.SetupIntent, req: NextRequest) {
  const accountId = si.metadata?.tlw_billing_account_id
  const coachId = si.metadata?.coach_id
  const pmId = typeof si.payment_method === 'string' ? si.payment_method : si.payment_method?.id
  const customerId = typeof si.customer === 'string' ? si.customer : si.customer?.id
  if (!accountId || !pmId || !customerId) return

  await attachPaymentMethodAsDefault(customerId, pmId).catch((e: any) =>
    console.error('[webhook] attach default PM failed:', e?.message),
  )

  let display = { brand: null as string | null, last4: null as string | null, exp_month: null as number | null, exp_year: null as number | null }
  try {
    display = cardDisplayFields(await retrievePaymentMethod(pmId))
  } catch { /* keep nulls */ }

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null

  await recordAuthorization(supabase, accountId, {
    paymentMethodId: pmId,
    setupIntentId: si.id,
    brand: display.brand,
    last4: display.last4,
    expMonth: display.exp_month,
    expYear: display.exp_year,
    ip,
  })

  if (coachId) {
    await logAuthorizationEvent(supabase, {
      billingAccountId: accountId,
      coachId,
      event: 'authorized',
      ip,
      detail: { brand: display.brand, last4: display.last4 },
    })
  }
}

async function handleSetupFailed(supabase: Admin, si: Stripe.SetupIntent) {
  const accountId = si.metadata?.tlw_billing_account_id
  const coachId = si.metadata?.coach_id
  if (!accountId || !coachId) return
  await logAuthorizationEvent(supabase, {
    billingAccountId: accountId,
    coachId,
    event: 'removed',
    detail: { reason: 'setup_failed', message: si.last_setup_error?.message ?? null },
  })
  // Notify the coach so they can follow up.
  const { data: acct } = (await supabase.from('billing_accounts').select('name').eq('id', accountId).maybeSingle()) as { data: any }
  const { data: coach } = (await supabase.from('coaches').select('email, name, google_refresh_token').eq('id', coachId).maybeSingle()) as { data: any }
  if (coach?.google_refresh_token && coach.email) {
    sendCoachHtmlEmail(coach, {
      to: coach.email,
      subject: `Card setup did not complete — ${acct?.name ?? 'client'}`,
      html: `<p style="font-family:sans-serif;">The card authorization for <strong>${acct?.name ?? 'a client'}</strong> did not complete. You may want to re-send the authorization link.</p>`,
    }).catch(() => {})
  }
}

async function handleCardUpdated(supabase: Admin, pm: Stripe.PaymentMethod) {
  const { data: account } = (await supabase
    .from('billing_accounts')
    .select('id')
    .eq('stripe_payment_method_id', pm.id)
    .maybeSingle()) as { data: any | null }
  if (!account) return
  const d = cardDisplayFields(pm)
  await refreshCardDisplay(supabase, account.id, { brand: d.brand, last4: d.last4, expMonth: d.exp_month, expYear: d.exp_year })
}

// ── Adjustment reconciliation (Phase 5) ─────────────────────────────────────────
async function handleCreditNoteCreated(supabase: Admin, cn: Stripe.CreditNote) {
  const { data: adj } = (await supabase
    .from('invoice_adjustments')
    .update({ status: 'succeeded' } as any)
    .eq('stripe_credit_note_id', cn.id)
    .select('id')
    .maybeSingle()) as { data: any | null }
  if (adj) await recomputeAdjustmentTotals(supabase, cn)
}

async function handleChargeRefunded(supabase: Admin, charge: Stripe.Charge) {
  // Best-effort confirm: refunds we issued carry a stripe_refund_id on the
  // adjustment. Confirm succeeded — creation already set it synchronously.
  const refundId = charge.refunds?.data?.[0]?.id
  if (!refundId) return
  await supabase
    .from('invoice_adjustments')
    .update({ status: 'succeeded' } as any)
    .eq('stripe_refund_id', refundId)
    .then(() => {}, () => {})
}

async function recomputeAdjustmentTotals(supabase: Admin, cn: Stripe.CreditNote) {
  const stripeInvoiceId = typeof cn.invoice === 'string' ? cn.invoice : cn.invoice?.id
  if (!stripeInvoiceId) return
  const { data: inv } = (await supabase.from('invoices').select('id').eq('stripe_invoice_id', stripeInvoiceId).maybeSingle()) as { data: any | null }
  if (!inv) return
  const { data: adjs } = (await supabase
    .from('invoice_adjustments')
    .select('type, amount_cents, status')
    .eq('invoice_id', inv.id)
    .eq('status', 'succeeded')) as { data: any[] | null }
  const refunded = (adjs ?? []).filter((a) => a.type === 'refund').reduce((s, a) => s + a.amount_cents, 0)
  const credited = (adjs ?? []).filter((a) => a.type === 'credit_to_balance').reduce((s, a) => s + a.amount_cents, 0)
  await supabase.from('invoices').update({ refunded_cents: refunded, credited_cents: credited, updated_at: new Date().toISOString() } as any).eq('id', inv.id)
}

async function handleDisputeCreated(supabase: Admin, dispute: Stripe.Dispute) {
  const pi = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id
  if (!pi) return
  const { data: attempt } = (await supabase
    .from('invoice_charge_attempts')
    .select('invoice_id')
    .eq('stripe_payment_intent_id', pi)
    .maybeSingle()) as { data: any | null }
  if (!attempt) return
  const { data: inv } = (await supabase
    .from('invoices')
    .select('coach_id, billing_account_id, billing_accounts ( authorization_text, authorized_at, authorized_ip )')
    .eq('id', attempt.invoice_id)
    .maybeSingle()) as { data: any | null }
  if (!inv) return
  await logAuthorizationEvent(supabase, {
    billingAccountId: inv.billing_account_id,
    coachId: inv.coach_id,
    event: 'charge_disputed',
    detail: {
      dispute_id: dispute.id,
      amount_cents: dispute.amount,
      reason: dispute.reason,
      // Attach the authorization snapshot for the dispute response.
      authorization_text: inv.billing_accounts?.authorization_text ?? null,
      authorized_at: inv.billing_accounts?.authorized_at ?? null,
      authorized_ip: inv.billing_accounts?.authorized_ip ?? null,
    },
  })
  // Surface loudly to the coach.
  const { data: coach } = (await supabase.from('coaches').select('email, name, google_refresh_token').eq('id', inv.coach_id).maybeSingle()) as { data: any }
  if (coach?.google_refresh_token && coach.email) {
    sendCoachHtmlEmail(coach, {
      to: coach.email,
      subject: `⚠ Payment dispute opened — respond promptly`,
      html: `<p style="font-family:sans-serif;">A card dispute (chargeback) was opened for ${(dispute.amount / 100).toLocaleString('en-US', { style: 'currency', currency: (dispute.currency || 'usd').toUpperCase() })}. Reason: ${dispute.reason}. The authorization snapshot is recorded for your response. Log into Stripe to submit evidence before the deadline.</p>`,
    }).catch(() => {})
  }
}

// ── Coach "payment received" note ───────────────────────────────────────────────
async function sendPaidNotificationToCoach(
  coach: { email: string; name: string; google_refresh_token: string | null },
  account: { name: string; billing_email: string } | null,
  totalNum: number,
  currency: string,
  hostedUrl: string | null,
) {
  if (!coach.email || !coach.google_refresh_token) return
  const total = (totalNum ?? 0).toLocaleString('en-US', { style: 'currency', currency: (currency ?? 'usd').toUpperCase() })
  const html = `
<div style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:24px;">
  <p style="margin:0 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#8a7f78;">Payment received</p>
  <h2 style="margin:0 0 12px;font-size:20px;color:#1a1f5e;">${total} paid</h2>
  <p style="margin:0 0 4px;font-size:14px;color:#3B3328;"><strong>${account?.name ?? 'Client'}</strong></p>
  <p style="margin:0 0 16px;font-size:13px;color:#8a7f78;">${account?.billing_email ?? ''}</p>
  ${hostedUrl ? `<p style="font-size:12px;color:#8a7f78;">Stripe invoice: <a href="${hostedUrl}" style="color:#1a1f5e;">${hostedUrl}</a></p>` : ''}
</div>`
  await sendCoachHtmlEmail(coach as any, { to: coach.email, subject: `Payment received — ${total} from ${account?.name ?? 'client'}`, html })
}

function readableDecline(lastErr: any): string {
  if (!lastErr) return 'The card was declined.'
  const code = lastErr.decline_code ?? lastErr.code ?? ''
  const map: Record<string, string> = {
    insufficient_funds: 'The card has insufficient funds.',
    card_declined: 'The card was declined by the issuer.',
    expired_card: 'The card has expired.',
    incorrect_cvc: 'The card security code was incorrect.',
    processing_error: 'A processing error occurred — try again shortly.',
    authentication_required: 'The card requires authentication (3D Secure).',
  }
  return map[code] || lastErr.message || 'The card was declined.'
}
