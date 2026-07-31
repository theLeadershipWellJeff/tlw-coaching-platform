/**
 * Payment on File — the stored-mandate lifecycle (migration 038).
 *
 * This module owns everything about a billing account's stored card: minting an
 * authorization link (gated on the agreement), the Stripe Checkout setup
 * session, attaching/detaching the payment method, state derivation, dormancy,
 * and the append-only authorization audit trail.
 *
 * The agreement gate (§4.2) is enforced HERE, not in the UI: an authorization
 * link cannot be minted unless every client attached to the account has
 * agreement_on_file = true.
 */
import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthorizationEvent, PaymentMethodStatus } from './types'

// The verbatim language shown to the client on the authorization page. Snapshotted
// onto billing_accounts.authorization_text at authorization time so a dispute can
// be answered with exactly what the client agreed to.
export const AUTHORIZATION_TEXT =
  'I authorize theLeadershipWell to securely store my payment card and to charge ' +
  'it for coaching fees as they come due, in the amounts and on the schedule set ' +
  'out in my signed coaching agreement. I understand this authorization remains ' +
  'in effect until I withdraw it, and that I can remove my card at any time by ' +
  'contacting my coach.'

// Max authorization sends per account per hour (§10 rate limit).
export const MAX_AUTH_SENDS_PER_HOUR = 5

// ── Authorization audit trail ───────────────────────────────────────────────────

export async function logAuthorizationEvent(
  supabase: SupabaseClient,
  opts: {
    billingAccountId: string
    coachId: string
    event: AuthorizationEvent
    ip?: string | null
    detail?: Record<string, unknown>
  },
): Promise<void> {
  await supabase
    .from('billing_authorization_events')
    .insert({
      billing_account_id: opts.billingAccountId,
      coach_id: opts.coachId,
      event: opts.event,
      ip: opts.ip ?? null,
      detail: opts.detail ?? null,
    })
    .then(() => {}, (e: any) => console.error('[payment-methods] event log failed:', e?.message))
}

// ── Agreement gate (§4.2) ───────────────────────────────────────────────────────

/**
 * True iff every client attached to the account (via coachees) has a signed
 * agreement on file. An account with no coachees fails the gate (nothing to
 * authorize against). Enterprise accounts require ALL attached clients.
 */
export async function accountPassesAgreementGate(
  supabase: SupabaseClient,
  accountId: string,
): Promise<{ ok: boolean; missing: string[] }> {
  const { data: coachees } = await supabase
    .from('coachees')
    .select('client_id, clients ( name, agreement_on_file )')
    .eq('billing_account_id', accountId)

  const rows = (coachees ?? []) as any[]
  if (rows.length === 0) return { ok: false, missing: ['(no clients linked to this account)'] }

  const missing = rows
    .filter((r) => !r.clients?.agreement_on_file)
    .map((r) => r.clients?.name ?? 'Unknown client')
  return { ok: missing.length === 0, missing }
}

// ── Rate limit (§10) ─────────────────────────────────────────────────────────────

/** True if the account has hit the 5-sends-per-hour authorization cap. */
export async function authorizationSendRateLimited(
  supabase: SupabaseClient,
  accountId: string,
): Promise<boolean> {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from('billing_authorization_events')
    .select('id', { count: 'exact', head: true })
    .eq('billing_account_id', accountId)
    .eq('event', 'link_sent')
    .gte('created_at', hourAgo)
  return (count ?? 0) >= MAX_AUTH_SENDS_PER_HOUR
}

// ── CA-owned exclusion (Phase 6) ────────────────────────────────────────────────

/**
 * True if the account is still billed through Coach Accountable — i.e. it has at
 * least one engagement with billing_owner = 'CA' and none owned by TLW. Such
 * accounts are excluded from the authorization announcement (§7 Phase 6).
 */
export async function accountIsCoachAccountableOwned(
  supabase: SupabaseClient,
  accountId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('engagements')
    .select('billing_owner')
    .eq('billing_account_id', accountId)
  const rows = (data ?? []) as { billing_owner: string }[]
  if (rows.length === 0) return false
  const hasTlw = rows.some((r) => r.billing_owner === 'TLW')
  const hasCa = rows.some((r) => r.billing_owner === 'CA')
  return hasCa && !hasTlw
}

// ── Token ───────────────────────────────────────────────────────────────────────

/**
 * Ensure the account has an authorization token, minting one if absent, and
 * stamp authorization_token_sent_at. Returns the token.
 */
export async function ensureAuthorizationToken(
  supabase: SupabaseClient,
  accountId: string,
  existing: string | null,
): Promise<string> {
  const token = existing ?? randomUUID()
  await supabase
    .from('billing_accounts')
    .update({
      authorization_token: token,
      authorization_token_sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any)
    .eq('id', accountId)
  return token
}

// ── State transitions ─────────────────────────────────────────────────────────

/**
 * Record a successful authorization: store the payment method display fields,
 * flip status → active, stamp authorized_* + the verbatim authorization text.
 * Called from the setup_intent.succeeded webhook.
 */
export async function recordAuthorization(
  supabase: SupabaseClient,
  accountId: string,
  fields: {
    paymentMethodId: string
    setupIntentId: string
    brand: string | null
    last4: string | null
    expMonth: number | null
    expYear: number | null
    ip?: string | null
    byEmail?: string | null
  },
): Promise<void> {
  const now = new Date().toISOString()
  await supabase
    .from('billing_accounts')
    .update({
      stripe_payment_method_id: fields.paymentMethodId,
      stripe_setup_intent_id: fields.setupIntentId,
      payment_method_type: 'card',
      payment_method_brand: fields.brand,
      payment_method_last4: fields.last4,
      payment_method_exp_month: fields.expMonth,
      payment_method_exp_year: fields.expYear,
      payment_method_status: 'active' as PaymentMethodStatus,
      authorized_at: now,
      authorized_ip: fields.ip ?? null,
      authorized_by_email: fields.byEmail ?? null,
      authorization_text: AUTHORIZATION_TEXT,
      dormant_at: null,
      reconfirmed_at: null,
      updated_at: now,
    } as any)
    .eq('id', accountId)
}

/** Refresh stored display fields after Stripe's card updater pushes new data. */
export async function refreshCardDisplay(
  supabase: SupabaseClient,
  accountId: string,
  fields: { brand: string | null; last4: string | null; expMonth: number | null; expYear: number | null },
): Promise<void> {
  await supabase
    .from('billing_accounts')
    .update({
      payment_method_brand: fields.brand,
      payment_method_last4: fields.last4,
      payment_method_exp_month: fields.expMonth,
      payment_method_exp_year: fields.expYear,
      updated_at: new Date().toISOString(),
    } as any)
    .eq('id', accountId)
}

/** Set the mandate status (removed / dormant / expired / reconfirmed → active). */
export async function setPaymentMethodStatus(
  supabase: SupabaseClient,
  accountId: string,
  status: PaymentMethodStatus,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await supabase
    .from('billing_accounts')
    .update({ payment_method_status: status, updated_at: new Date().toISOString(), ...extra } as any)
    .eq('id', accountId)
}
