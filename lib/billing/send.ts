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
  usesHostedInvoice,
} from './stripe'
import type { BillingMode } from './types'
import { normalizeBillingSettings } from './settings'
import { sendCoachHtmlEmail } from '@/lib/gmail'

type SendResult =
  | { ok: true; stripeId: string }
  | { ok: false; error: string }

export async function sendInvoice(
  supabase: SupabaseClient,
  coachId: string,
  invoiceId: string,
  coach?: { email: string; name: string; google_refresh_token: string | null; billing_settings?: Record<string, unknown> | null },
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

  // All modes use Stripe hosted invoice — client receives email + chooses payment method.
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

    // CC the coach a copy if billing_settings.cc_self_on_send is enabled (default: true).
    if (coach) {
      const bs = normalizeBillingSettings(coach.billing_settings as any)
      if (bs.cc_self_on_send) {
        sendCoachCopy(coach, account, invoice as any, lines, stripeInv.hosted_invoice_url ?? null).catch(() => {})
      }
    }

    return { ok: true, stripeId: stripeInv.id }
  } catch (e: any) {
    const errMsg = stripeErrorMessage(e)
    await writeError(supabase, invoiceId, errMsg)
    return { ok: false, error: errMsg }
  }
}

// ── Coach copy email ──────────────────────────────────────────────────────────

async function sendCoachCopy(
  coach: { email: string; name: string; google_refresh_token: string | null },
  account: { name: string; billing_email: string },
  invoice: { total: number; currency: string; period_start?: string | null; period_end?: string | null; client_message?: string | null },
  lines: { description: string; amount: number }[],
  hostedUrl: string | null,
) {
  function money(n: number) {
    return n.toLocaleString('en-US', { style: 'currency', currency: invoice.currency?.toUpperCase() ?? 'USD' })
  }
  const lineRows = lines
    .map((l) => `<tr><td style="padding:6px 0;color:#3B3328;">${l.description}</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#1a1f5e;">${money(l.amount)}</td></tr>`)
    .join('')

  const periodLine = invoice.period_start && invoice.period_end
    ? `<p style="margin:0 0 12px;font-size:13px;color:#8a7f78;">Period: ${invoice.period_start} → ${invoice.period_end}</p>`
    : ''

  const messageLine = invoice.client_message
    ? `<p style="margin:0 0 16px;font-size:13px;color:#3B3328;font-style:italic;">&ldquo;${invoice.client_message}&rdquo;</p>`
    : ''

  const viewLink = hostedUrl
    ? `<p style="margin:16px 0 0;font-size:12px;color:#8a7f78;">Stripe link: <a href="${hostedUrl}" style="color:#1a1f5e;">${hostedUrl}</a></p>`
    : ''

  const html = `
<div style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:24px;">
  <p style="margin:0 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#8a7f78;">COPY — Invoice sent to client</p>
  <h2 style="margin:0 0 2px;font-size:18px;color:#1a1f5e;">${account.name}</h2>
  <p style="margin:0 0 16px;font-size:13px;color:#8a7f78;">${account.billing_email}</p>
  ${periodLine}${messageLine}
  <table style="width:100%;border-collapse:collapse;border-top:1px solid #e8e2dc;">
    ${lineRows}
    <tr style="border-top:1px solid #e8e2dc;">
      <td style="padding:10px 0;font-size:14px;font-weight:700;color:#1a1f5e;">Total</td>
      <td style="padding:10px 0;text-align:right;font-size:16px;font-weight:700;color:#1a1f5e;">${money(invoice.total)}</td>
    </tr>
  </table>
  ${viewLink}
</div>`

  await sendCoachHtmlEmail(coach as any, {
    to: coach.email,
    subject: `[Copy] Invoice sent to ${account.name} — ${money(invoice.total)}`,
    html,
  })
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
