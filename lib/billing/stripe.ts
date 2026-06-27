/**
 * Stripe singleton + low-level helpers for the billing system.
 *
 * All Stripe interaction goes through this file. Never import `stripe` directly
 * from route handlers — always import from here so the key-missing guard
 * and the API-version pin are consistent.
 */
import Stripe from 'stripe'
import type { BillingMode } from './types'

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (_stripe) return _stripe
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  _stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' })
  return _stripe
}

// ── Customer ──────────────────────────────────────────────────────────────────

/**
 * Get or create a Stripe customer for a billing account.
 * If the account already has a stripe_customer_id, we return it unchanged.
 * Otherwise we create one and return the new id — the caller is responsible
 * for persisting it back to billing_accounts.
 */
export async function getOrCreateStripeCustomer(opts: {
  stripeCustomerId: string | null
  accountName: string
  billingEmail: string
}): Promise<string> {
  const stripe = getStripe()
  if (opts.stripeCustomerId) return opts.stripeCustomerId

  const customer = await stripe.customers.create({
    name: opts.accountName,
    email: opts.billingEmail,
    metadata: { source: 'tlw-coaching-platform' },
  })
  return customer.id
}

// ── Invoice (hosted) ──────────────────────────────────────────────────────────

export type StripeLineItem = {
  description: string
  amount: number // in dollars; will be converted to cents
  quantity: number
}

/**
 * Create a Stripe hosted invoice for arrears / per_engagement invoices.
 * The invoice is finalised and sent to the customer immediately.
 * Returns the Stripe invoice object.
 */
export async function createAndSendStripeInvoice(opts: {
  customerId: string
  lines: StripeLineItem[]
  currency: string
  description?: string
  metadata?: Record<string, string>
}): Promise<Stripe.Invoice> {
  const stripe = getStripe()

  // Create invoice items for each line.
  // Stripe does not allow both `amount` and `quantity` — amount is the total
  // for the line in cents; quantity is implicit when amount is set directly.
  for (const line of opts.lines) {
    await stripe.invoiceItems.create({
      customer: opts.customerId,
      amount: Math.round(line.amount * 100), // cents, total for this line
      currency: opts.currency,
      description: line.description,
    })
  }

  // Create the invoice in draft state.
  const invoice = await stripe.invoices.create({
    customer: opts.customerId,
    currency: opts.currency,
    description: opts.description,
    auto_advance: true, // Stripe finalises and sends automatically
    collection_method: 'send_invoice',
    days_until_due: 30,
    metadata: opts.metadata ?? {},
  })

  // Finalise + send.
  const sent = await stripe.invoices.sendInvoice(invoice.id)
  return sent
}

// ── PaymentIntent (off-session, subscriptions) ────────────────────────────────

/**
 * Create a Stripe PaymentIntent for a subscription flat-fee charge.
 * Uses off_session because there is no live card collection UI; the client
 * has agreed upfront and a saved payment method is expected on the customer.
 *
 * If no payment method is attached we create a manual-capture intent so the
 * coach can later collect payment. The caller surfaces `requires_action` /
 * `requires_payment_method` states as named failures.
 */
export async function createSubscriptionPaymentIntent(opts: {
  customerId: string
  amountDollars: number
  currency: string
  description: string
  metadata?: Record<string, string>
}): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe()

  // Retrieve the customer's default payment method if any.
  const customer = await stripe.customers.retrieve(opts.customerId) as Stripe.Customer
  const defaultPM = customer.invoice_settings?.default_payment_method as string | null

  if (defaultPM) {
    return stripe.paymentIntents.create({
      customer: opts.customerId,
      amount: Math.round(opts.amountDollars * 100),
      currency: opts.currency,
      payment_method: defaultPM,
      confirm: true,
      off_session: true,
      description: opts.description,
      metadata: opts.metadata ?? {},
    })
  }

  // No saved card — create an uncaptured intent; status will be
  // requires_payment_method, surfaced as stripe_error on the invoice.
  return stripe.paymentIntents.create({
    customer: opts.customerId,
    amount: Math.round(opts.amountDollars * 100),
    currency: opts.currency,
    description: opts.description,
    metadata: opts.metadata ?? {},
    capture_method: 'manual',
  })
}

// ── Webhook signature verification ───────────────────────────────────────────

export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string,
  secret: string,
): Stripe.Event {
  return getStripe().webhooks.constructEvent(payload, signature, secret)
}

// ── Billing-mode routing ──────────────────────────────────────────────────────

/**
 * All billing modes use a hosted Stripe invoice so the client receives an email
 * and can choose how to pay (card, bank, etc.) without requiring a saved payment
 * method on file. Stripe's hosted payment page lets them save a card and enable
 * auto-pay for future invoices.
 */
export function usesHostedInvoice(_mode: BillingMode): boolean {
  return true
}

/** @deprecated — all modes now use hosted invoices. Kept for import compatibility. */
export function usesPaymentIntent(_mode: BillingMode): boolean {
  return false
}
