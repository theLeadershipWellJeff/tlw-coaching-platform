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
  for (const line of opts.lines) {
    await stripe.invoiceItems.create({
      customer: opts.customerId,
      amount: Math.round(line.amount * 100), // cents
      currency: opts.currency,
      description: line.description,
      quantity: line.quantity,
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

/** True if this billing mode should use a hosted invoice (Stripe Invoice object). */
export function usesHostedInvoice(mode: BillingMode): boolean {
  return mode === 'arrears' || mode === 'per_engagement'
}

/** True if this billing mode should use an off-session PaymentIntent. */
export function usesPaymentIntent(mode: BillingMode): boolean {
  return mode === 'subscription'
}
