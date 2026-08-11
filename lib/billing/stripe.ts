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
  // Pin to a known-stable API version. The 'dahlia' version (2026-06-24) silently
  // zeroes invoice item amounts when using the `amount` field directly.
  _stripe = new Stripe(key, { apiVersion: '2023-10-16' as any })
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

  // Validate line amounts before creating anything in Stripe. Negative amounts
  // are valid (discount/credit lines) — zero amounts are not, and the invoice
  // must net out to a positive charge or Stripe can't finalize/collect it.
  const lineCents = opts.lines.map((line) => {
    const amountCents = Math.round(line.amount * 100)
    if (amountCents === 0) {
      throw new Error(`Invoice line "${line.description}" has a zero amount (${line.amount}). Check that invoice_lines.amount is in dollars.`)
    }
    return amountCents
  })
  const totalCents = lineCents.reduce((s, c) => s + c, 0)
  if (totalCents <= 0) {
    throw new Error('Invoice total must be greater than zero after discounts.')
  }

  // Create the invoice first so we can attach items to it explicitly.
  // This avoids any ambiguity about which pending items Stripe collects.
  const invoice = await stripe.invoices.create({
    customer: opts.customerId,
    currency: opts.currency,
    description: opts.description,
    collection_method: 'send_invoice',
    days_until_due: 30,
    metadata: opts.metadata ?? {},
  })

  // Attach each line item directly to this invoice via the `invoice` param.
  // Negative amounts render as discount/credit lines on the hosted invoice.
  for (let i = 0; i < opts.lines.length; i++) {
    await stripe.invoiceItems.create({
      customer: opts.customerId,
      invoice: invoice.id,
      amount: lineCents[i],
      currency: opts.currency,
      description: opts.lines[i].description,
    })
  }

  // Finalise + send.
  await stripe.invoices.finalizeInvoice(invoice.id)
  const sent = await stripe.invoices.sendInvoice(invoice.id)
  return sent
}

/**
 * Mark a finalized Stripe invoice as paid OUTSIDE Stripe (cash, check, bank
 * transfer) via `paid_out_of_band`. This records the invoice as Paid without
 * attempting a card charge, so it's registered everywhere the invoice lives
 * (Dashboard, the customer's history, reports, the PDF). Used when the coach
 * marks an invoice paid in the app.
 *
 * Returns { synced } — synced:true if Stripe now shows it paid (including the
 * "already paid" case, which is success for our purposes), false + reason if the
 * reconcile couldn't complete. Never throws: reconciling Stripe is best-effort
 * and must not block marking the invoice paid in the app.
 */
export async function markStripeInvoicePaidOutOfBand(
  stripeInvoiceId: string,
): Promise<{ synced: boolean; reason?: string }> {
  try {
    const stripe = getStripe()
    const inv = await stripe.invoices.retrieve(stripeInvoiceId)
    // Already settled — nothing to do, and calling pay() would throw.
    if (inv.status === 'paid') return { synced: true }
    if (inv.status === 'void' || inv.status === 'uncollectible') {
      return { synced: false, reason: `Stripe invoice is ${inv.status}` }
    }
    await stripe.invoices.pay(stripeInvoiceId, { paid_out_of_band: true })
    return { synced: true }
  } catch (e: any) {
    // A concurrent online payment may have already paid it — treat as synced.
    if (typeof e?.message === 'string' && /already\s+paid/i.test(e.message)) {
      return { synced: true }
    }
    return { synced: false, reason: e?.message ?? 'Stripe reconcile failed' }
  }
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

// ── Payment on File: setup mandates (migration 038) ─────────────────────────────

/**
 * Create a Stripe Checkout session in `setup` mode. This collects a card on
 * Stripe's hosted page (PCI SAQ-A — card entry never touches a TLW page) and
 * produces a SetupIntent whose payment method attaches to the customer.
 *
 * The setup_intent_data metadata carries our billing-account + coach ids so the
 * `setup_intent.succeeded` webhook can resolve the account without a lookup.
 */
export async function createSetupCheckoutSession(opts: {
  customerId: string
  billingAccountId: string
  coachId: string
  successUrl: string
  cancelUrl: string
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe()
  return stripe.checkout.sessions.create({
    mode: 'setup',
    customer: opts.customerId,
    payment_method_types: ['card'],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    setup_intent_data: {
      metadata: {
        tlw_billing_account_id: opts.billingAccountId,
        coach_id: opts.coachId,
      },
    },
    metadata: {
      tlw_billing_account_id: opts.billingAccountId,
      coach_id: opts.coachId,
    },
  })
}

export async function retrieveSetupIntent(setupIntentId: string): Promise<Stripe.SetupIntent> {
  return getStripe().setupIntents.retrieve(setupIntentId)
}

export async function retrievePaymentMethod(paymentMethodId: string): Promise<Stripe.PaymentMethod> {
  return getStripe().paymentMethods.retrieve(paymentMethodId)
}

/**
 * Attach a payment method to a customer and set it as the invoice default so an
 * invoice created `charge_automatically` draws on it. Idempotent — re-attaching
 * an already-attached method is a no-op that still updates the default.
 */
export async function attachPaymentMethodAsDefault(
  customerId: string,
  paymentMethodId: string,
): Promise<void> {
  const stripe = getStripe()
  try {
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId })
  } catch (e: any) {
    // Already attached to this customer → fine; anything else re-throws.
    if (!/already been attached/i.test(e?.message ?? '')) throw e
  }
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  })
}

/** Detach a stored card. Best-effort: an already-detached method resolves ok. */
export async function detachPaymentMethod(paymentMethodId: string): Promise<void> {
  try {
    await getStripe().paymentMethods.detach(paymentMethodId)
  } catch (e: any) {
    if (/already been detached|No such PaymentMethod/i.test(e?.message ?? '')) return
    throw e
  }
}

/** Card display fields off a Stripe PaymentMethod, for the stored mandate. */
export function cardDisplayFields(pm: Stripe.PaymentMethod): {
  brand: string | null
  last4: string | null
  exp_month: number | null
  exp_year: number | null
} {
  const card = pm.card
  return {
    brand: card?.brand ?? null,
    last4: card?.last4 ?? null,
    exp_month: card?.exp_month ?? null,
    exp_year: card?.exp_year ?? null,
  }
}

// ── Payment on File: adjustments (credit notes / refunds / void) ────────────────

/**
 * Retrieve a finalized invoice's captured amount in cents — the arithmetic
 * ceiling for a refund/credit (never trust the UI). Returns 0 if unknown.
 */
export async function invoiceAmountCaptured(stripeInvoiceId: string): Promise<number> {
  const inv = await getStripe().invoices.retrieve(stripeInvoiceId)
  // amount_paid is the settled amount in cents on a paid invoice.
  return (inv as any).amount_paid ?? 0
}

/**
 * Create a Stripe credit note against a paid invoice. A refund credit note moves
 * money back to the card; a credit_to_balance note posts a customer-balance
 * credit that auto-applies to the next invoice. Passing an idempotency key
 * collapses duplicate requests.
 */
export async function createCreditNote(opts: {
  stripeInvoiceId: string
  amountCents: number
  kind: 'refund' | 'credit_to_balance'
  memo: string
  idempotencyKey: string
}): Promise<Stripe.CreditNote> {
  const stripe = getStripe()
  const params: Stripe.CreditNoteCreateParams = {
    invoice: opts.stripeInvoiceId,
    memo: opts.memo,
  }
  if (opts.kind === 'refund') {
    params.refund_amount = opts.amountCents
  } else {
    params.credit_amount = opts.amountCents
  }
  return stripe.creditNotes.create(params, { idempotencyKey: opts.idempotencyKey })
}

/** Void a finalized-but-unpaid Stripe invoice. */
export async function voidStripeInvoice(
  stripeInvoiceId: string,
  idempotencyKey: string,
): Promise<Stripe.Invoice> {
  return getStripe().invoices.voidInvoice(stripeInvoiceId, undefined, { idempotencyKey })
}

/**
 * Read a Stripe invoice's live state so a void/adjust can reconcile against it —
 * our stored status can lag a webhook (e.g. the client paid but the paid webhook
 * never landed), and Stripe only lets you void an `open` invoice. `status` is one
 * of draft|open|paid|void|uncollectible; `paidAt` is the settled timestamp when paid.
 */
export async function getStripeInvoiceState(
  stripeInvoiceId: string,
): Promise<{ status: string | null; paidAt: string | null; amountPaid: number }> {
  const inv = (await getStripe().invoices.retrieve(stripeInvoiceId)) as any
  const paidTs = inv.status_transitions?.paid_at
  return {
    status: inv.status ?? null,
    paidAt: paidTs ? new Date(paidTs * 1000).toISOString() : null,
    amountPaid: inv.amount_paid ?? 0,
  }
}

/** Fetch a finalized invoice's PDF bytes for the branded receipt attachment. */
export async function fetchInvoicePdf(stripeInvoiceId: string): Promise<Buffer | null> {
  const inv = await getStripe().invoices.retrieve(stripeInvoiceId)
  const url = (inv as any).invoice_pdf as string | undefined
  if (!url) return null
  const res = await fetch(url)
  if (!res.ok) return null
  const arr = await res.arrayBuffer()
  return Buffer.from(arr)
}

/** Live hosted-invoice URL (never stored — can't go stale). */
export async function hostedInvoiceUrl(stripeInvoiceId: string): Promise<string | null> {
  try {
    const inv = await getStripe().invoices.retrieve(stripeInvoiceId)
    return (inv as any).hosted_invoice_url ?? null
  } catch {
    return null
  }
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
