/**
 * sendInvoice(invoiceId, supabase, coachId)
 *
 * The one send path for billing. Called from POST /api/billing/invoices/[id]/send.
 *
 * Flow:
 *  1. Load invoice + lines + billing account.
 *  2. Resolve/create Stripe customer; persist stripe_customer_id if new.
 *  3. Route by the engagement's billing_mode:
 *       arrears / per_engagement → Stripe hosted invoice (createAndSendStripeInvoice)
 *       subscription             → off-session PaymentIntent
 *  4. On Stripe success  → status = 'sent', stripe_invoice_id / stripe_payment_intent_id written.
 *  5. On Stripe failure  → status stays 'approved', stripe_error set (never silently swallowed).
 *
 * The function throws only on internal/db errors. Stripe transport errors are
 * caught and written to stripe_error — the caller gets back { ok: false, error }.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getOrCreateStripeCustomer,
  createAndSendStripeInvoice,
  createSubscriptionPaymentIntent,
  usesHostedInvoice,
} from './stripe'
import type { BillingMode } from './types'

type SendResult =
  | { ok: true; stripeId: string }
  | { ok: false; error: string }

export async function sendInvoice(
  supabase: SupabaseClient,
  coachId: string,
  invoiceId: string,
): Promise<SendResult> {
  // 1. Load invoice with lines + account.
  const { data: invoice, error: fetchErr } = await supabase
    .from('invoices')
    .select(`
      *,
      billing_accounts ( id, name, type, billing_email, stripe_customer_id ),
      invoice_lines ( id, description, quantity, unit_amount, amount, source, coachee_id )
    `)
    .eq('id', invoiceId)
    .eq('coach_id', coachId)
    .maybeSingle()

  if (fetchErr) throw new Error(`sendInvoice: db error — ${fetchErr.message}`)
  if (!invoice) throw new Error(`sendInvoice: invoice ${invoiceId} not found`)
  if (invoice.status !== 'approved') {
    throw new Error(`sendInvoice: invoice must be in 'approved' status (current: ${invoice.status})`)
  }

  const account = (invoice as any).billing_accounts
  const lines: any[] = (invoice as any).invoice_lines ?? []

  if (lines.length === 0) {
    throw new Error('sendInvoice: invoice has no lines — cannot send')
  }

  // 2. Determine billing mode from the first line's source.
  // source → billing mode mapping (close enough for routing):
  //   session                → arrears
  //   subscription           → subscription
  //   engagement_installment → per_engagement
  const sourceToMode: Record<string, BillingMode> = {
    session: 'arrears',
    subscription: 'subscription',
    engagement_installment: 'per_engagement',
  }
  const detectedMode: BillingMode = sourceToMode[lines[0]?.source] ?? 'arrears'

  // 3. Get or create Stripe customer.
  let stripeCustomerId: string
  try {
    stripeCustomerId = await getOrCreateStripeCustomer({
      stripeCustomerId: account.stripe_customer_id,
      accountName: account.name,
      billingEmail: account.billing_email,
    })
  } catch (e: any) {
    const errMsg = `Stripe customer error: ${e.message}`
    await writeError(supabase, invoiceId, errMsg)
    return { ok: false, error: errMsg }
  }

  // Persist new customer id if we just created it.
  if (!account.stripe_customer_id) {
    await supabase
      .from('billing_accounts')
      .update({ stripe_customer_id: stripeCustomerId })
      .eq('id', account.id)
  }

  const currency = (invoice as any).currency ?? 'usd'
  const total: number = (invoice as any).total

  // 4. Send via the appropriate Stripe path.
  const now = new Date().toISOString()

  if (usesHostedInvoice(detectedMode)) {
    try {
      const stripeInv = await createAndSendStripeInvoice({
        customerId: stripeCustomerId,
        currency,
        lines: lines.map((l: any) => ({
          description: l.description,
          amount: l.amount,
          quantity: l.quantity,
        })),
        metadata: { tlw_invoice_id: invoiceId, coach_id: coachId },
      })

      await supabase
        .from('invoices')
        .update({
          status: 'sent',
          stripe_invoice_id: stripeInv.id,
          stripe_error: null,
          sent_at: now,
          updated_at: now,
        })
        .eq('id', invoiceId)

      return { ok: true, stripeId: stripeInv.id }
    } catch (e: any) {
      const errMsg = stripeErrorMessage(e)
      await writeError(supabase, invoiceId, errMsg)
      return { ok: false, error: errMsg }
    }
  } else {
    // Subscription → off-session PaymentIntent.
    try {
      const pi = await createSubscriptionPaymentIntent({
        customerId: stripeCustomerId,
        amountDollars: total,
        currency,
        description: lines[0]?.description ?? 'Coaching subscription',
        metadata: { tlw_invoice_id: invoiceId, coach_id: coachId },
      })

      // Map PI status to invoice status.
      const piStatus = pi.status
      let invoiceStatus: string = 'sent'
      let stripeError: string | null = null

      if (piStatus === 'succeeded') {
        invoiceStatus = 'paid'
      } else if (piStatus === 'requires_action') {
        // SCA required — client must authenticate.
        stripeError = 'Payment requires customer authentication (SCA). Share the Stripe payment link with the client.'
      } else if (piStatus === 'requires_payment_method') {
        stripeError = 'No payment method on file. Add a card in Stripe and retry.'
      }

      await supabase
        .from('invoices')
        .update({
          status: invoiceStatus,
          stripe_payment_intent_id: pi.id,
          stripe_error: stripeError,
          sent_at: now,
          paid_at: piStatus === 'succeeded' ? now : null,
          updated_at: now,
        })
        .eq('id', invoiceId)

      if (stripeError) return { ok: false, error: stripeError }
      return { ok: true, stripeId: pi.id }
    } catch (e: any) {
      const errMsg = stripeErrorMessage(e)
      await writeError(supabase, invoiceId, errMsg)
      return { ok: false, error: errMsg }
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function writeError(supabase: SupabaseClient, invoiceId: string, msg: string) {
  await supabase
    .from('invoices')
    .update({ stripe_error: msg, updated_at: new Date().toISOString() })
    .eq('id', invoiceId)
}

function stripeErrorMessage(e: any): string {
  // Stripe errors have .message; handle SCA codes explicitly.
  const code: string = e.code ?? ''
  if (code === 'authentication_required') {
    return 'Payment requires customer authentication (SCA). The client must complete 3D Secure.'
  }
  if (code === 'card_declined') {
    return `Card declined: ${e.decline_code ?? 'unknown reason'}. Ask the client to update their payment method.`
  }
  return e.message ?? 'Unknown Stripe error'
}
