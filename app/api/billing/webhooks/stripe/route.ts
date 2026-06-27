/**
 * POST /api/billing/webhooks/stripe
 *
 * Stripe webhook handler. Validates the signature using STRIPE_WEBHOOK_SECRET,
 * then syncs invoice/payment-intent state back into the invoices table.
 *
 * Events handled:
 *   invoice.paid                      → status = 'paid', paid_at = event time
 *   invoice.payment_failed            → status = 'failed', stripe_error set
 *   invoice.payment_action_required   → stripe_error set (SCA required)
 *   payment_intent.succeeded          → status = 'paid', paid_at = event time
 *   payment_intent.payment_failed     → status = 'failed', stripe_error set
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

  try {
    switch (event.type) {
      case 'invoice.paid': {
        const stripeInv = event.data.object as Stripe.Invoice
        const tlwId = stripeInv.metadata?.tlw_invoice_id
        if (tlwId) {
          await supabase
            .from('invoices')
            .update({
              status: 'paid',
              paid_at: now,
              stripe_error: null,
              updated_at: now,
            })
            .eq('id', tlwId)
            .in('status', ['sent', 'overdue', 'failed'])
          // Cancel any pending reminders now that it's paid.
          await cancelReminders(supabase, tlwId)
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
        const tlwId = pi.metadata?.tlw_invoice_id
        if (tlwId) {
          await supabase
            .from('invoices')
            .update({
              status: 'paid',
              paid_at: now,
              stripe_error: null,
              updated_at: now,
            })
            .eq('id', tlwId)
            .in('status', ['sent', 'overdue', 'failed'])
          await cancelReminders(supabase, tlwId)
        }
        break
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent
        const tlwId = pi.metadata?.tlw_invoice_id
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
    console.error(`Stripe webhook handler error (${event.type}):`, e)
    return NextResponse.json({ error: 'Internal handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
