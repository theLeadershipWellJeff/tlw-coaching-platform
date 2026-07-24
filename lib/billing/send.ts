/**
 * sendInvoice(invoiceId, supabase, coachId)
 *
 * The one send path for billing. Called from POST /api/billing/invoices/[id]/send.
 *
 * Flow:
 *  1. Load invoice + lines + billing account.
 *  2. Resolve/create Stripe customer; persist stripe_customer_id if new.
 *  3. Mint a receipt token (migration 037) so client-facing links can mark
 *     the invoice "received" on first open — best-effort, send works without it.
 *  4. Create the Stripe hosted invoice (client_message rides along as the
 *     Stripe memo/description so the client sees it on the invoice + email).
 *  5. On Stripe success  → status = 'sent', stripe_invoice_id written, then a
 *     branded cover email (coach's note + tracked "View & pay" link) goes to
 *     the client from the coach's Gmail (best-effort, never blocks the send),
 *     and a copy to the coach if billing_settings.cc_self_on_send.
 *  6. On Stripe failure  → status stays 'approved', stripe_error set (never
 *     silently swallowed).
 *
 * resendInvoice(supabase, coachId, invoiceId, coach)
 *
 * Re-delivery for an already-sent invoice (status sent/overdue/failed with a
 * stripe_invoice_id): asks Stripe to re-email the hosted invoice, re-sends the
 * branded cover email, and stamps last_resent_at. Status is unchanged — a
 * resend is delivery, not a state transition.
 *
 * Both functions throw only on internal/db errors. Stripe transport errors are
 * caught and written to stripe_error — the caller gets back { ok: false, error }.
 */
import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getOrCreateStripeCustomer,
  createAndSendStripeInvoice,
  getStripe,
  usesHostedInvoice,
} from './stripe'
import type { BillingMode } from './types'
import { normalizeBillingSettings } from './settings'
import { sendCoachHtmlEmail } from '@/lib/gmail'
import { getBaseUrl } from '@/lib/url'

type SendResult =
  | { ok: true; stripeId: string }
  | { ok: false; error: string }

type CoachRow = {
  email: string
  name: string
  google_refresh_token: string | null
  billing_settings?: Record<string, unknown> | null
}

export async function sendInvoice(
  supabase: SupabaseClient,
  coachId: string,
  invoiceId: string,
  coach?: CoachRow,
): Promise<SendResult> {
  // 1. Load invoice with lines + account.
  const { data: invoice, error: fetchErr } = await supabase
    .from('invoices')
    .select(`
      *,
      billing_accounts ( id, name, type, billing_email, billing_cc, stripe_customer_id ),
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

  // Mint the receipt token before sending so the cover email can carry the
  // tracked link. Persisted separately from the status update so a missing
  // migration-037 column can never block the actual send.
  const receiptToken = await ensureReceiptToken(supabase, invoiceId, (invoice as any).receipt_token ?? null)

  // 4. Send via the Stripe hosted invoice.
  const now = new Date().toISOString()

  try {
    const stripeInv = await createAndSendStripeInvoice({
      customerId: stripeCustomerId,
      currency,
      // The coach's note rides along as the Stripe memo — shown at the top of
      // the hosted invoice page, the emailed invoice, and the PDF.
      description: (invoice as any).client_message ?? undefined,
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

    if (coach) {
      // Branded cover email to the client — the coach's note in the coach's
      // voice + the tracked "View & pay" link. Best-effort: the Stripe email
      // already delivered the invoice, so a Gmail hiccup never fails the send.
      sendClientCoverEmail(supabase, coach, coachId, account, invoice as any, {
        receiptToken,
        hostedUrl: stripeInv.hosted_invoice_url ?? null,
        resend: false,
      }).catch(() => {})

      // CC the coach a copy if billing_settings.cc_self_on_send is enabled (default: true).
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

// ── Re-send ───────────────────────────────────────────────────────────────────

/**
 * Re-deliver an already-sent invoice: Stripe re-emails the hosted invoice and
 * the branded cover email goes out again. Allowed for sent / overdue / failed
 * invoices that have a stripe_invoice_id ('failed' means a payment attempt
 * failed AFTER delivery — re-sending gives the client the payment link again).
 */
export async function resendInvoice(
  supabase: SupabaseClient,
  coachId: string,
  invoiceId: string,
  coach?: CoachRow,
): Promise<SendResult> {
  const { data: invoice, error: fetchErr } = await supabase
    .from('invoices')
    .select('*, billing_accounts ( id, name, type, billing_email, billing_cc, stripe_customer_id )')
    .eq('id', invoiceId)
    .eq('coach_id', coachId)
    .maybeSingle()

  if (fetchErr) throw new Error(`resendInvoice: db error — ${fetchErr.message}`)
  if (!invoice) throw new Error(`resendInvoice: invoice ${invoiceId} not found`)
  if (!['sent', 'overdue', 'failed'].includes(invoice.status)) {
    throw new Error(`resendInvoice: invoice must be sent/overdue/failed to re-send (current: ${invoice.status})`)
  }
  const stripeInvoiceId: string | null = (invoice as any).stripe_invoice_id
  if (!stripeInvoiceId) {
    throw new Error('resendInvoice: invoice has no Stripe invoice — use send instead')
  }

  const account = (invoice as any).billing_accounts
  const receiptToken = await ensureReceiptToken(supabase, invoiceId, (invoice as any).receipt_token ?? null)

  try {
    const stripeInv = await getStripe().invoices.sendInvoice(stripeInvoiceId)

    const now = new Date().toISOString()
    // Best-effort audit stamp — a missing migration-037 column never fails the resend.
    await supabase
      .from('invoices')
      .update({ last_resent_at: now, updated_at: now } as any)
      .eq('id', invoiceId)
      .then(() => {}, () => {})

    if (coach) {
      sendClientCoverEmail(supabase, coach, coachId, account, invoice as any, {
        receiptToken,
        hostedUrl: stripeInv.hosted_invoice_url ?? null,
        resend: true,
      }).catch(() => {})
    }

    return { ok: true, stripeId: stripeInv.id }
  } catch (e: any) {
    // A resend failure is transport-only — don't write stripe_error over a
    // possibly meaningful payment error already on the invoice.
    return { ok: false, error: stripeErrorMessage(e) }
  }
}

// ── Receipt token ─────────────────────────────────────────────────────────────

/**
 * Return the invoice's receipt token, minting + persisting one if absent.
 * Returns null if the token can't be persisted (e.g. migration 037 not yet
 * applied) — callers then fall back to the untracked hosted URL.
 */
async function ensureReceiptToken(
  supabase: SupabaseClient,
  invoiceId: string,
  existing: string | null,
): Promise<string | null> {
  if (existing) return existing
  const token = randomUUID()
  try {
    const { error } = await supabase
      .from('invoices')
      .update({ receipt_token: token } as any)
      .eq('id', invoiceId)
    if (error) return null
    return token
  } catch {
    return null
  }
}

// ── Client cover email ────────────────────────────────────────────────────────

/**
 * The branded delivery email in the coach's voice, sent from the coach's Gmail
 * alongside Stripe's own invoice email. Carries the coach's note
 * (invoices.client_message) and the tracked "View & pay invoice" button —
 * opening it marks the invoice received. Logged to communications.
 */
async function sendClientCoverEmail(
  supabase: SupabaseClient,
  coach: CoachRow,
  coachId: string,
  account: { name: string; billing_email: string; billing_cc?: string | null },
  invoice: { id: string; total: number; currency: string; period_start?: string | null; period_end?: string | null; client_message?: string | null },
  opts: { receiptToken: string | null; hostedUrl: string | null; resend: boolean },
) {
  if (!coach.google_refresh_token || !account?.billing_email) return

  const viewUrl = opts.receiptToken
    ? `${getBaseUrl()}/api/billing/invoices/receipt/${opts.receiptToken}`
    : opts.hostedUrl
  const period = invoice.period_end
    ? new Date(invoice.period_end + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : ''
  const total = (invoice.total ?? 0).toLocaleString('en-US', {
    style: 'currency',
    currency: invoice.currency?.toUpperCase() ?? 'USD',
  })

  const subject = opts.resend
    ? `Resending: your invoice${period ? ` for ${period}` : ''} — ${total}`
    : `Your invoice${period ? ` for ${period}` : ''} — ${total}`

  const noteBlock = invoice.client_message
    ? `<p style="margin:0 0 16px;color:#3d2b1f;font-size:15px;line-height:1.6;">${escapeHtml(invoice.client_message)}</p>`
    : ''

  const buttonBlock = viewUrl
    ? `<p style="margin:0 0 24px;">
         <a href="${viewUrl}" style="display:inline-block;background:#111226;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;">View &amp; pay invoice</a>
       </p>`
    : ''

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f9f7f4;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f7f4;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background:#111226;padding:24px 32px;">
            <p style="margin:0;color:#ffffff;font-family:Georgia,serif;font-size:18px;letter-spacing:1px;">
              THE LEADERSHIP WELL
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 16px;color:#3d2b1f;font-size:15px;line-height:1.6;">
              Dear ${escapeHtml(account.name)},
            </p>
            ${noteBlock}
            <p style="margin:0 0 24px;color:#3d2b1f;font-size:15px;line-height:1.6;">
              ${opts.resend ? 'Re-sending your' : 'Your'} invoice${period ? ` for <strong>${period}</strong>` : ''}
              in the amount of <strong>${total}</strong> is ready. You can view the details and pay
              securely online${viewUrl ? ' using the button below' : ' via the Stripe invoice email'}.
            </p>
            ${buttonBlock}
            <p style="margin:0;color:#3d2b1f;font-size:15px;line-height:1.6;">
              Warmly,<br />
              <strong>${escapeHtml(coach.name || 'Dr. Jeff Holmes')}</strong><br />
              <span style="color:#7a6e6a;font-size:13px;">theLeadershipWell</span>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9f7f4;padding:16px 32px;border-top:1px solid #e8e0d8;">
            <p style="margin:0;color:#7a6e6a;font-size:11px;text-align:center;">
              theLeadershipWell · jeff@theleadershipwell.com
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  const sent = await sendCoachHtmlEmail(coach as any, {
    to: account.billing_email,
    cc: account.billing_cc ?? undefined,
    subject,
    html,
  })

  // Log to communications (client_id null — billed at the account level).
  await supabase.from('communications').insert({
    coach_id: coachId,
    client_id: null,
    type: 'email',
    direction: 'outbound',
    subject,
    status: sent ? 'sent' : 'failed',
  }).then(() => {}, () => {})
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ── Client payment thank-you ────────────────────────────────────────────────────

/**
 * Branded "thank you for your payment" email to the client, sent from the coach's
 * Gmail and logged to communications. One shared path for both ways an invoice
 * gets paid — the coach marking it paid in the app (offline payment) and the
 * Stripe webhook when the client pays online — so the client always gets exactly
 * one warm confirmation in the coach's voice. Best-effort: returns whether it
 * sent; a Gmail hiccup never blocks the paid transition.
 */
export async function sendPaymentThankYou(
  supabase: SupabaseClient,
  coach: CoachRow,
  coachId: string,
  account: { name: string; billing_email: string; billing_cc?: string | null },
  invoice: { total: number; currency: string; period_start?: string | null; period_end?: string | null },
): Promise<boolean> {
  if (!coach.google_refresh_token || !account?.billing_email) return false

  const period = invoice.period_end
    ? new Date(invoice.period_end + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : ''
  const total = (invoice.total ?? 0).toLocaleString('en-US', {
    style: 'currency',
    currency: invoice.currency?.toUpperCase() ?? 'USD',
  })

  const subject = `Thank you — payment received${period ? ` for ${period}` : ''} (${total})`

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f9f7f4;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f7f4;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background:#111226;padding:24px 32px;">
            <p style="margin:0;color:#ffffff;font-family:Georgia,serif;font-size:18px;letter-spacing:1px;">
              THE LEADERSHIP WELL
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#7a6e6a;">Payment received</p>
            <h2 style="margin:0 0 16px;font-size:22px;color:#111226;">Thank you</h2>
            <p style="margin:0 0 16px;color:#3d2b1f;font-size:15px;line-height:1.6;">
              Dear ${escapeHtml(account.name)},
            </p>
            <p style="margin:0 0 24px;color:#3d2b1f;font-size:15px;line-height:1.6;">
              We've received your payment of <strong>${total}</strong>${period ? ` for <strong>${period}</strong>` : ''}.
              Thank you — it's a genuine pleasure to do this work with you. No further action is needed;
              this email is your confirmation.
            </p>
            <p style="margin:0;color:#3d2b1f;font-size:15px;line-height:1.6;">
              Warmly,<br />
              <strong>${escapeHtml(coach.name || 'Dr. Jeff Holmes')}</strong><br />
              <span style="color:#7a6e6a;font-size:13px;">theLeadershipWell</span>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9f7f4;padding:16px 32px;border-top:1px solid #e8e0d8;">
            <p style="margin:0;color:#7a6e6a;font-size:11px;text-align:center;">
              theLeadershipWell · jeff@theleadershipwell.com
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  const sent = await sendCoachHtmlEmail(coach as any, {
    to: account.billing_email,
    cc: account.billing_cc ?? undefined,
    subject,
    html,
  }).catch(() => false)

  // Log to communications (client_id null — billed at the account level).
  await supabase.from('communications').insert({
    coach_id: coachId,
    client_id: null,
    type: 'email',
    direction: 'outbound',
    subject,
    status: sent ? 'sent' : 'failed',
  }).then(() => {}, () => {})

  return sent
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
