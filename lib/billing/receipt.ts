/**
 * Branded billing emails composed here and sent through the coach's Gmail rails
 * (lib/gmail.ts). Three client-facing messages live in this module:
 *
 *  - sendAuthorizationInvite  — "store a card for automatic billing" (Phase 1/6)
 *  - sendPaymentReceipt       — "payment received", wrapping the paid Stripe
 *                               invoice PDF + hosted link (Phase 3)
 *  - sendAdjustmentNotice     — refund / credit / void notice (Phase 5)
 *
 * Every send is logged to communications (type 'billing_authorization',
 * 'receipt', or 'billing_adjustment') — sent or failed, never silent. All are
 * best-effort at the transport layer: a Gmail hiccup returns false, it never
 * throws into the money path.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendCoachHtmlEmail, type EmailAttachment } from '@/lib/gmail'
import { fetchInvoicePdf, hostedInvoiceUrl } from './stripe'
import { getBaseUrl } from '@/lib/url'

type CoachRow = { email: string; name: string; google_refresh_token: string | null }

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function money(cents: number, currency = 'usd'): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: currency.toUpperCase() })
}

function dollars(n: number, currency = 'usd'): string {
  return (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: currency.toUpperCase() })
}

// Shared branded shell — mirrors lib/billing/send.ts so all billing mail reads
// as one system.
function shell(inner: string, coachEmail?: string): string {
  const footerContact = coachEmail ? escapeHtml(coachEmail) : 'jeff@theleadershipwell.com'
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f9f7f4;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f7f4;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#111226;padding:24px 32px;">
          <p style="margin:0;color:#ffffff;font-family:Georgia,serif;font-size:18px;letter-spacing:1px;">THE LEADERSHIP WELL</p>
        </td></tr>
        <tr><td style="padding:32px;">${inner}</td></tr>
        <tr><td style="background:#f9f7f4;padding:16px 32px;border-top:1px solid #e8e0d8;">
          <p style="margin:0;color:#7a6e6a;font-size:11px;text-align:center;">theLeadershipWell · ${footerContact}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

async function logComm(
  supabase: SupabaseClient,
  coachId: string,
  type: 'billing_authorization' | 'receipt' | 'billing_adjustment',
  subject: string,
  sent: boolean,
): Promise<string | null> {
  const { data } = await supabase
    .from('communications')
    .insert({ coach_id: coachId, client_id: null, type, direction: 'outbound', subject, status: sent ? 'sent' : 'failed' })
    .select('id')
    .maybeSingle()
    .then((r) => r, () => ({ data: null }))
  return (data as any)?.id ?? null
}

// ── Authorization invite (Phase 1 / Phase 6) ────────────────────────────────────

export async function sendAuthorizationInvite(
  supabase: SupabaseClient,
  coach: CoachRow,
  coachId: string,
  opts: { accountName: string; billingEmail: string; billingCc: string | null; token: string; announcement: boolean },
): Promise<boolean> {
  if (!coach.google_refresh_token) return false

  const link = `${getBaseUrl()}/billing/authorize/${opts.token}`
  const subject = opts.announcement
    ? 'A simpler way to handle your coaching payments'
    : 'Set up automatic payments for your coaching'

  const lead = opts.announcement
    ? `We're introducing a simpler way to handle payments. Rather than paying each invoice by hand, you can securely store a card and let payments run automatically as fees come due — exactly on the terms in your signed coaching agreement.`
    : `To make billing effortless, you can securely store a card so coaching fees are charged automatically as they come due — on the terms set out in your signed coaching agreement.`

  const inner = `
    <p style="margin:0 0 16px;color:#3d2b1f;font-size:15px;line-height:1.6;">Dear ${escapeHtml(opts.accountName)},</p>
    <p style="margin:0 0 16px;color:#3d2b1f;font-size:15px;line-height:1.6;">${lead}</p>
    <p style="margin:0 0 8px;color:#3d2b1f;font-size:15px;line-height:1.6;">Your card details are entered on Stripe's secure page — theLeadershipWell never sees or stores your card number. You can remove your card at any time.</p>
    <p style="margin:24px 0;">
      <a href="${link}" style="display:inline-block;background:#111226;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;">Store my card securely</a>
    </p>
    <p style="margin:0;color:#3d2b1f;font-size:15px;line-height:1.6;">Warmly,<br /><strong>${escapeHtml(coach.name || coach.email)}</strong><br /><span style="color:#7a6e6a;font-size:13px;">theLeadershipWell</span></p>`

  const sent = await sendCoachHtmlEmail(coach as any, {
    to: opts.billingEmail,
    cc: opts.billingCc ?? undefined,
    subject,
    html: shell(inner, coach.email),
  }).catch(() => false)

  await logComm(supabase, coachId, 'billing_authorization', subject, sent)
  return sent
}

// ── Payment receipt (Phase 3) ───────────────────────────────────────────────────

/**
 * Branded "payment received" wrapping the paid Stripe invoice PDF (attached) +
 * the hosted invoice link. This is what a client forwards to expense. Sent only
 * for card-on-file (charge_automatically) invoices; hosted-invoice payments keep
 * the existing thank-you. Returns { sent, communicationId } for stamping.
 */
export async function sendPaymentReceipt(
  supabase: SupabaseClient,
  coach: CoachRow,
  coachId: string,
  account: { name: string; billing_email: string; billing_cc?: string | null },
  invoice: { total: number; currency: string; period_start?: string | null; period_end?: string | null; stripe_invoice_id: string | null },
): Promise<{ sent: boolean; communicationId: string | null }> {
  if (!coach.google_refresh_token || !account?.billing_email) return { sent: false, communicationId: null }

  const period = invoice.period_end
    ? new Date(invoice.period_end + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : ''
  const total = dollars(invoice.total, invoice.currency)
  const subject = `Receipt — payment received${period ? ` for ${period}` : ''} (${total})`

  // Attach the paid Stripe invoice PDF + link the hosted page. Both best-effort:
  // a receipt-send failure must never un-collect a successful payment.
  let attachments: EmailAttachment[] | undefined
  let hostedUrl: string | null = null
  if (invoice.stripe_invoice_id) {
    try {
      const [pdf, url] = await Promise.all([
        fetchInvoicePdf(invoice.stripe_invoice_id),
        hostedInvoiceUrl(invoice.stripe_invoice_id),
      ])
      if (pdf) attachments = [{ filename: 'invoice.pdf', contentType: 'application/pdf', content: pdf }]
      hostedUrl = url
    } catch { /* fall through — receipt still sends without the PDF */ }
  }

  const linkBlock = hostedUrl
    ? `<p style="margin:16px 0 0;color:#3d2b1f;font-size:14px;">View your paid invoice online: <a href="${hostedUrl}" style="color:#111226;">${hostedUrl}</a></p>`
    : ''

  const inner = `
    <p style="margin:0 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#7a6e6a;">Payment received</p>
    <h2 style="margin:0 0 16px;font-size:22px;color:#111226;">Thank you</h2>
    <p style="margin:0 0 16px;color:#3d2b1f;font-size:15px;line-height:1.6;">Dear ${escapeHtml(account.name)},</p>
    <p style="margin:0 0 8px;color:#3d2b1f;font-size:15px;line-height:1.6;">We've charged your card on file <strong>${total}</strong>${period ? ` for <strong>${period}</strong>` : ''}. Your paid invoice is attached for your records. No further action is needed.</p>
    ${linkBlock}
    <p style="margin:24px 0 0;color:#3d2b1f;font-size:15px;line-height:1.6;">Warmly,<br /><strong>${escapeHtml(coach.name || coach.email)}</strong><br /><span style="color:#7a6e6a;font-size:13px;">theLeadershipWell</span></p>`

  const sent = await sendCoachHtmlEmail(coach as any, {
    to: account.billing_email,
    cc: account.billing_cc ?? undefined,
    subject,
    html: shell(inner, coach.email),
    attachments,
  }).catch(() => false)

  const communicationId = await logComm(supabase, coachId, 'receipt', subject, sent)
  return { sent, communicationId }
}

// ── Adjustment notice (Phase 5) ─────────────────────────────────────────────────

export async function sendAdjustmentNotice(
  supabase: SupabaseClient,
  coach: CoachRow,
  coachId: string,
  account: { name: string; billing_email: string; billing_cc?: string | null },
  adj: { type: 'refund' | 'credit_to_balance' | 'void'; amount_cents: number; currency: string; brandLast4?: string | null },
): Promise<{ sent: boolean; communicationId: string | null }> {
  if (!coach.google_refresh_token || !account?.billing_email) return { sent: false, communicationId: null }

  const amount = money(adj.amount_cents, adj.currency)
  let subject: string
  let body: string
  if (adj.type === 'refund') {
    subject = `A refund of ${amount} is on its way`
    body = `We've issued a refund of <strong>${amount}</strong>${adj.brandLast4 ? ` back to your ${escapeHtml(adj.brandLast4)}` : ''}. Refunds typically take 5–10 business days to appear on your statement.`
  } else if (adj.type === 'credit_to_balance') {
    subject = `A ${amount} credit has been applied to your account`
    body = `We've applied a credit of <strong>${amount}</strong> to your account. It will be applied automatically to your next invoice.`
  } else {
    subject = `Your invoice has been cancelled`
    body = `The invoice for <strong>${amount}</strong> has been cancelled. No payment is due. Please disregard any earlier notice for it.`
  }

  const inner = `
    <p style="margin:0 0 16px;color:#3d2b1f;font-size:15px;line-height:1.6;">Dear ${escapeHtml(account.name)},</p>
    <p style="margin:0 0 16px;color:#3d2b1f;font-size:15px;line-height:1.6;">${body}</p>
    <p style="margin:24px 0 0;color:#3d2b1f;font-size:15px;line-height:1.6;">Warmly,<br /><strong>${escapeHtml(coach.name || coach.email)}</strong><br /><span style="color:#7a6e6a;font-size:13px;">theLeadershipWell</span></p>`

  const sent = await sendCoachHtmlEmail(coach as any, {
    to: account.billing_email,
    cc: account.billing_cc ?? undefined,
    subject,
    html: shell(inner, coach.email),
  }).catch(() => false)

  const communicationId = await logComm(supabase, coachId, 'billing_adjustment', subject, sent)
  return { sent, communicationId }
}
