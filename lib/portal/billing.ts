/**
 * Client Portal billing — resolution and reads.
 *
 * THE RULE, in one place on purpose: a client sees billing ONLY when they are
 * the payer, i.e. their billing account is `type = 'solo'`. On an enterprise
 * engagement the payer is the company, so a coachee must see nothing — not their
 * own line items, not the account's invoices, not even that an account exists.
 *
 * Every portal billing route resolves through `resolvePortalBillingAccount` so
 * that rule cannot be forgotten on a later endpoint, and routes 404 rather than
 * 403 on a miss so the response never confirms an account is there.
 */
import { getSupabaseAdmin } from '@/lib/supabase/server'

export type PortalBillingAccount = {
  id: string
  coachId: string
  name: string
  billingEmail: string
  stripeCustomerId: string | null
  paymentMethodStatus: string | null
  paymentMethodBrand: string | null
  paymentMethodLast4: string | null
  paymentMethodExpMonth: number | null
  paymentMethodExpYear: number | null
}

/**
 * The billing account this portal client may see, or null.
 *
 * Returns null for: no billing account linked, or an enterprise account (the
 * company pays). Callers must treat null as "no billing surface at all".
 */
export async function resolvePortalBillingAccount(
  clientId: string
): Promise<PortalBillingAccount | null> {
  const supabase = getSupabaseAdmin()

  const { data: coachee } = await supabase
    .from('coachees')
    .select('billing_account_id')
    .eq('client_id', clientId)
    .maybeSingle()
  if (!coachee?.billing_account_id) return null

  const { data: account } = await supabase
    .from('billing_accounts')
    .select(
      'id, coach_id, name, type, status, billing_email, stripe_customer_id, payment_method_status, payment_method_brand, payment_method_last4, payment_method_exp_month, payment_method_exp_year'
    )
    .eq('id', coachee.billing_account_id)
    .maybeSingle()
  if (!account) return null

  // The gate. Anything but a solo account is invisible to the client.
  if (account.type !== 'solo') return null

  return {
    id: account.id,
    coachId: account.coach_id,
    name: account.name,
    billingEmail: account.billing_email,
    stripeCustomerId: account.stripe_customer_id ?? null,
    paymentMethodStatus: account.payment_method_status ?? null,
    paymentMethodBrand: account.payment_method_brand ?? null,
    paymentMethodLast4: account.payment_method_last4 ?? null,
    paymentMethodExpMonth: account.payment_method_exp_month ?? null,
    paymentMethodExpYear: account.payment_method_exp_year ?? null,
  }
}

export type PortalInvoice = {
  id: string
  status: string
  /** Dollars — `invoices.total` is numeric(10,2), not minor units. */
  total: number
  currency: string
  periodStart: string | null
  periodEnd: string | null
  sentAt: string | null
  paidAt: string | null
  /** Tracked "view & pay" link — only offered while something is owed. */
  payToken: string | null
}

/** Statuses where the client still owes something and a pay link makes sense. */
const OWING = ['sent', 'overdue', 'failed']

/** This account's invoices, newest first. Read-only. */
export async function loadPortalInvoices(accountId: string, limit = 24): Promise<PortalInvoice[]> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('invoices')
    .select(
      'id, status, total, currency, period_start, period_end, sent_at, paid_at, receipt_token, created_at'
    )
    .eq('billing_account_id', accountId)
    // Drafts are the coach's working state, not a bill — never show one, and
    // never show a voided invoice either.
    .not('status', 'in', '(draft,void)')
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? []).map((i) => ({
    id: i.id,
    status: i.status,
    total: Number(i.total ?? 0),
    currency: (i.currency || 'usd').toUpperCase(),
    periodStart: i.period_start ?? null,
    periodEnd: i.period_end ?? null,
    sentAt: i.sent_at ?? null,
    paidAt: i.paid_at ?? null,
    payToken: i.receipt_token && OWING.includes(i.status) ? i.receipt_token : null,
  }))
}
