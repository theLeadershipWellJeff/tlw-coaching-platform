/**
 * POST /api/billing/webhooks/stripe
 *
 * Stripe webhook handler. Validates the signature using STRIPE_WEBHOOK_SECRET,
 * then syncs invoice/payment-intent state back into the invoices table.
 *
 * Events handled:
 *   invoice.paid                      → paid (once) + client thank-you + coach notice
 *   invoice.payment_failed            → status = 'failed', stripe_error set
 *   invoice.payment_action_required   → stripe_error set (SCA required)
 *   payment_intent.succeeded          → paid (once) + client thank-you + coach notice
 *   payment_intent.payment_failed     → status = 'failed', stripe_error set
 *
 * The paid transition is idempotent across events AND the coach's manual
 * mark-paid: handlePaidTransition guards the update on the prior status and only
 * the row-flipping call sends emails (see the fn comment), so a payment yields
 * exactly one client thank-you.
 *
 * All events are matched to our invoice via metadata.tlw_invoice_id.
 * Unknown / unhandled event types return 200 immediately.
 *
 * Set up in Stripe Dashboard:
 *   Endpoint URL: https://theleadershipwell.online/api/billing/webhooks/stripe
 *   Events: invoice.paid, invoice.payment_failed, invoice.payment_action_required,
 *            payment_intent.succeeded, payment_intent.payment_failed
 *   Copy the signing secret → STRIPE_WEBHOOK_SECRET env var.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { constructWebhookEvent } from '@/lib/billing/stripe'
import { cancelReminders } from '@/lib/billing/reminders'
import { sendPaymentThankYou } from '@/lib/billing/send'
import { sendCoachHtmlEmail } from '@/lib/gmail'
import type Stripe from 'stripe'

// Stripe sends raw body; disable body parsing.
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    const rawBody = await req.text()
    event = constructWebhookEvent(rawBody, signature, secret)
  } catch (e: any) {
    return NextResponse.json({ error: `Webhook signature verification failed: ${e.message}` }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const now = new Date().toISOString()

  // All DB work is best-effort after signature verification — we return 200
  // regardless so Stripe doesn't retry an already-verified event indefinitely.
  // Errors are logged for investigation via Vercel logs.
  try {
    switch (event.type) {
      case 'invoice.paid': {
        const stripeInv = event.data.object as Stripe.Invoice
        const tlwId = stripeInv.metadata?.tlw_invoice_id
        if (tlwId) {
          await handlePaidTransition(supabase, tlwId, now, (stripeInv as any).hosted_invoice_url ?? null)
        }
        break
      }

      case 'invoice.payment_failed': {
        const stripeInv = event.data.object as Stripe.Invoice
        const tlwId = stripeInv.metadata?.tlw_invoice_id
        if (tlwId) {
          const lastErr = (stripeInv as any).last_payment_error
          const errMsg = lastErr?.message ?? 'Stripe payment failed'
          await supabase
            .from('invoices')
            .update({
              status: 'failed',
              stripe_error: errMsg,
              updated_at: now,
            })
            .eq('id', tlwId)
        }
        break
      }

      case 'invoice.payment_action_required': {
        const stripeInv = event.data.object as Stripe.Invoice
        const tlwId = stripeInv.metadata?.tlw_invoice_id
        if (tlwId) {
          await supabase
            .from('invoices')
            .update({
              stripe_error: 'Payment requires customer authentication (SCA). Send the client the Stripe payment link.',
              updated_at: now,
            })
            .eq('id', tlwId)
        }
        break
      }

      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent
        // For hosted invoices Stripe auto-creates the PI without our metadata —
        // fall back to looking up our invoice via the Stripe invoice ID.
        const tlwId = pi.metadata?.tlw_invoice_id ?? await resolveTlwIdFromStripeInvoice(supabase, (pi as any).invoice)
        if (tlwId) {
          await handlePaidTransition(supabase, tlwId, now, null)
        }
        break
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent
        // For hosted invoices Stripe auto-creates the PI without our metadata —
        // fall back to looking up our invoice via the Stripe invoice ID.
        const tlwId = pi.metadata?.tlw_invoice_id ?? await resolveTlwIdFromStripeInvoice(supabase, (pi as any).invoice)
        if (tlwId) {
          const lastErr = pi.last_payment_error
          const errMsg = lastErr?.message ?? 'Stripe payment failed'
          await supabase
            .from('invoices')
            .update({
              status: 'failed',
              stripe_error: errMsg,
              updated_at: now,
            })
            .eq('id', tlwId)
        }
        break
      }

      default:
        // Unhandled event type — return 200 so Stripe doesn't retry.
        break
    }
  } catch (e: any) {
    // Log but still return 200 — the event was verified and we don't want
    // Stripe to keep retrying. Check Vercel logs for the error detail.
    console.error(`Stripe webhook handler error (${event.type}):`, e)
  }

  return NextResponse.json({ received: true })
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Stripe hosted invoices auto-create PaymentIntents without our metadata.
// Look up the TLW invoice id via the stripe_invoice_id we stored at send time.
async function resolveTlwIdFromStripeInvoice(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  stripeInvoiceId: string | null | undefined,
): Promise<string | null> {
  if (!stripeInvoiceId) return null
  const { data } = await supabase
    .from('invoices')
    .select('id')
    .eq('stripe_invoice_id', stripeInvoiceId)
    .maybeSingle()
  return data?.id ?? null
}

/**
 * Transition an invoice to paid exactly once, then fire notifications.
 *
 * The `.in('status', ['sent','overdue','failed'])` guard + `.select()` means the
 * FIRST event to arrive (invoice.paid vs payment_intent.succeeded — Stripe fires
 * both for one payment) makes the transition and returns the row; every later
 * event (and the echo from a coach's manual `paid_out_of_band`) matches zero rows
 * and returns null, so reminders are cancelled and the emails are sent once.
 */
async function handlePaidTransition(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  tlwInvoiceId: string,
  now: string,
  hostedUrl: string | null,
) {
  const { data: updated } = await supabase
    .from('invoices')
    .update({ status: 'paid', paid_at: now, stripe_error: null, updated_at: now })
    .eq('id', tlwInvoiceId)
    .in('status', ['sent', 'overdue', 'failed'])
    .select('coach_id, total, currency, period_start, period_end, billing_accounts ( name, billing_email, billing_cc )')
    .maybeSingle() as {
      data:
        | {
            coach_id: string
            total: number
            currency: string
            period_start: string | null
            period_end: string | null
            billing_accounts: { name: string; billing_email: string; billing_cc: string | null } | null
          }
        | null
    }
  // Null = already paid (a prior event or the manual mark-paid handled it). Skip
  // so reminders and emails only ever fire on the real transition.
  if (!updated) return

  await cancelReminders(supabase, tlwInvoiceId).catch((e: any) => {
    console.error('cancelReminders failed (non-fatal):', e?.message)
  })

  const { data: coach } = await supabase
    .from('coaches')
    .select('email, name, google_refresh_token, billing_settings')
    .eq('id', updated.coach_id)
    .maybeSingle() as { data: { email: string; name: string; google_refresh_token: string | null; billing_settings: any } | null }
  if (!coach) return

  const account = updated.billing_accounts

  // Branded thank-you to the client — best-effort, logged to communications.
  if (account) {
    sendPaymentThankYou(supabase, coach as any, updated.coach_id, account, {
      total: updated.total,
      currency: updated.currency,
      period_start: updated.period_start,
      period_end: updated.period_end,
    }).catch(() => {})
  }

  // "Payment received" note to the coach — best-effort.
  sendPaidNotificationToCoach(coach, account, updated.total, updated.currency, hostedUrl).catch(() => {})
}

async function sendPaidNotificationToCoach(
  coach: { email: string; name: string; google_refresh_token: string | null },
  account: { name: string; billing_email: string } | null,
  totalNum: number,
  currency: string,
  hostedUrl: string | null,
) {
  if (!coach.email) return
  const total = (totalNum ?? 0).toLocaleString('en-US', { style: 'currency', currency: (currency ?? 'usd').toUpperCase() })
  const html = `
<div style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:24px;">
  <p style="margin:0 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#8a7f78;">Payment received</p>
  <h2 style="margin:0 0 12px;font-size:20px;color:#1a1f5e;">${total} paid</h2>
  <p style="margin:0 0 4px;font-size:14px;color:#3B3328;"><strong>${account?.name ?? 'Client'}</strong></p>
  <p style="margin:0 0 16px;font-size:13px;color:#8a7f78;">${account?.billing_email ?? ''}</p>
  ${hostedUrl ? `<p style="font-size:12px;color:#8a7f78;">Stripe invoice: <a href="${hostedUrl}" style="color:#1a1f5e;">${hostedUrl}</a></p>` : ''}
</div>`

  await sendCoachHtmlEmail(coach as any, {
    to: coach.email,
    subject: `Payment received — ${total} from ${account?.name ?? 'client'}`,
    html,
  })
}
