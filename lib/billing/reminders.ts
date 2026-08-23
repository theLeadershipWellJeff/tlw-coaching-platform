/**
 * Invoice reminder ladder (migration 056). Invoices are due on receipt, so the
 * cadence anchors to the send date, ~14 days between rungs:
 *
 *   nudge_14d   ~day 14  gentle reminder (save-card block if no card on file)
 *   overdue_1   ~day 28  flips the invoice sent → overdue + firmer notice
 *   overdue_2   ~day 42  final automated client reminder (no save-card block —
 *                        by then the ask should come from the coach)
 *   coach_alert ~day 56  no client email: notifies the COACH that automated
 *                        reminders are exhausted and a personal follow-up is
 *                        owed; stamps invoices.reminders_exhausted_at.
 *
 * scheduleReminder(supabase, invoiceId)
 *   Called after an invoice is sent. Schedules the first rung at sent_at + 14d.
 *
 * sendDueReminders(supabase)
 *   Called by the hourly cron. Sends every due rung, then schedules the NEXT
 *   rung at now + 14 days — pacing from the actual previous send, so a
 *   late-started ladder (e.g. the migration-056 backfill) never bursts.
 *   Each rung is claimed (status='scheduled' → 'sent' optimistic lock) before
 *   sending, and a UNIQUE index on (invoice_id, kind) makes double-fire
 *   impossible even across concurrent runs.
 *
 * cancelReminders(supabase, invoiceId)
 *   Cancels all scheduled rungs for an invoice (called on paid/void/refund) —
 *   the whole remaining ladder dies with the debt.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendCoachHtmlEmail } from '@/lib/gmail'
import { getBaseUrl } from '@/lib/url'

export const REMINDER_LADDER = [
  { kind: 'nudge_14d' },
  { kind: 'overdue_1' },
  { kind: 'overdue_2' },
  { kind: 'coach_alert' },
] as const

export type ReminderKind = (typeof REMINDER_LADDER)[number]['kind']

/** Days between rungs — and from send to the first rung. */
const CADENCE_DAYS = 14

function nextRungAfter(kind: string): ReminderKind | null {
  const i = REMINDER_LADDER.findIndex((r) => r.kind === kind)
  if (i === -1) return null
  return REMINDER_LADDER[i + 1]?.kind ?? null
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
}

// ── Schedule ──────────────────────────────────────────────────────────────────

export async function scheduleReminder(
  supabase: SupabaseClient,
  invoiceId: string,
): Promise<void> {
  // Load invoice to confirm it's actually sent.
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, coach_id, sent_at, status')
    .eq('id', invoiceId)
    .maybeSingle()

  if (!invoice || invoice.status !== 'sent') return

  const sentAt = invoice.sent_at ? new Date(invoice.sent_at) : new Date()
  const sendAt = new Date(sentAt.getTime() + CADENCE_DAYS * 24 * 60 * 60 * 1000)

  // The unique index on (invoice_id, kind) makes this idempotent — a repeat
  // call conflicts and is swallowed.
  await supabase
    .from('invoice_reminders')
    .insert({
      invoice_id: invoiceId,
      kind: 'nudge_14d',
      send_at: sendAt.toISOString(),
      status: 'scheduled',
      channel: 'email',
    } as any)
    .then(() => {}, () => {})
}

/** Schedule the next rung of the ladder, paced from now. Idempotent. */
async function scheduleNextRung(
  supabase: SupabaseClient,
  invoiceId: string,
  afterKind: string,
): Promise<void> {
  const next = nextRungAfter(afterKind)
  if (!next) return
  await supabase
    .from('invoice_reminders')
    .insert({
      invoice_id: invoiceId,
      kind: next,
      send_at: daysFromNow(CADENCE_DAYS),
      status: 'scheduled',
      channel: 'email',
    } as any)
    .then(() => {}, () => {})
}

// ── Cancel ────────────────────────────────────────────────────────────────────

export async function cancelReminders(
  supabase: SupabaseClient,
  invoiceId: string,
): Promise<void> {
  await supabase
    .from('invoice_reminders')
    .update({ status: 'cancelled' })
    .eq('invoice_id', invoiceId)
    .eq('status', 'scheduled')
}

// ── Send due reminders (cron) ─────────────────────────────────────────────────

export async function sendDueReminders(supabase: SupabaseClient): Promise<{ sent: number; errors: number }> {
  const now = new Date().toISOString()

  // Load all due scheduled reminders with invoice + account + coach.
  const { data: reminders, error } = await supabase
    .from('invoice_reminders')
    .select(`
      id,
      invoice_id,
      kind,
      invoices!inner (
        id,
        coach_id,
        total,
        currency,
        period_start,
        period_end,
        status,
        receipt_token,
        billing_accounts ( name, billing_email, billing_cc, payment_method_status, authorization_token )
      )
    `)
    .eq('status', 'scheduled')
    .lte('send_at', now)

  if (error || !reminders) return { sent: 0, errors: 0 }

  let sent = 0
  let errors = 0

  for (const reminder of reminders) {
    const invoice = (reminder as any).invoices
    if (!invoice) continue
    const kind: string = (reminder as any).kind ?? 'nudge_14d'

    // Only act on invoices that are still outstanding.
    if (!['sent', 'overdue'].includes(invoice.status)) {
      // Auto-cancel for paid/void/failed invoices.
      await supabase.from('invoice_reminders').update({ status: 'cancelled' }).eq('id', reminder.id)
      continue
    }

    // Claim the reminder slot before sending (prevents double-fire on retries).
    const { error: claimErr } = await supabase
      .from('invoice_reminders')
      .update({ status: 'sent', sent_at: now })
      .eq('id', reminder.id)
      .eq('status', 'scheduled') // Only update if still scheduled (optimistic lock).

    if (claimErr) { errors++; continue }

    // Load coach for the Gmail send (client rungs and the coach alert alike).
    const { data: coach } = await supabase
      .from('coaches')
      .select('*')
      .eq('id', invoice.coach_id)
      .maybeSingle()

    if (!coach?.google_refresh_token) { errors++; continue }

    const account = (invoice.billing_accounts as any)
    const period = invoice.period_end
      ? new Date(invoice.period_end + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : ''
    const totalFormatted = (invoice.total ?? 0).toLocaleString('en-US', {
      style: 'currency',
      currency: invoice.currency?.toUpperCase() ?? 'USD',
    })

    try {
      if (kind === 'coach_alert') {
        // Ladder exhausted — tell the coach, not the client.
        // sendCoachHtmlEmail returns false on a transport failure (it only
        // throws on a missing token) — surface both as a retryable failure.
        const alerted = await sendCoachHtmlEmail(coach, {
          to: coach.email,
          subject: `Needs attention: ${account?.name ?? 'a client'}'s invoice is still unpaid`,
          html: buildCoachAlertEmail({
            accountName: account?.name ?? 'Unknown account',
            billingEmail: account?.billing_email ?? '',
            period,
            total: totalFormatted,
            invoiceUrl: `${getBaseUrl()}/business-center/invoices/${invoice.id}`,
          }),
        })
        if (!alerted) throw new Error('Gmail send failed')
        // Stamp the invoice so the Business Center shows the flag. Best-effort:
        // a missing migration-056 column never fails the alert.
        await supabase
          .from('invoices')
          .update({ reminders_exhausted_at: now, updated_at: now } as any)
          .eq('id', invoice.id)
          .then(() => {}, () => {})
        sent++
        continue
      }

      // First overdue rung flips the invoice sent → overdue (due on receipt —
      // by ~day 28 it has earned the label). Guarded so a webhook-paid invoice
      // is never stomped.
      if (kind === 'overdue_1' && invoice.status === 'sent') {
        await supabase
          .from('invoices')
          .update({ status: 'overdue', updated_at: now })
          .eq('id', invoice.id)
          .eq('status', 'sent')
          .then(() => {}, () => {})
      }

      const subject = reminderSubject(kind, period)
      const htmlBody = buildReminderEmail({
        kind,
        accountName: account?.name ?? 'Client',
        coachName: coach.name || coach.email,
        coachEmail: coach.email,
        period,
        total: totalFormatted,
        // Tracked view link (marks the invoice received, then redirects to the
        // Stripe hosted payment page). Absent for pre-037 invoices.
        viewUrl: invoice.receipt_token
          ? `${getBaseUrl()}/api/billing/invoices/receipt/${invoice.receipt_token}`
          : null,
        // "Save a card" block (Phase 6 pattern) — only for accounts without an
        // active card that already hold an authorization token (tokens are only
        // minted through the agreement-gated send path, so the gate is
        // respected by construction). Left off the final client rung.
        authUrl:
          kind !== 'overdue_2' &&
          account?.payment_method_status !== 'active' &&
          account?.authorization_token
            ? `${getBaseUrl()}/billing/authorize/${account.authorization_token}`
            : null,
      })

      const delivered = await sendCoachHtmlEmail(coach, {
        to: account?.billing_email ?? '',
        cc: account?.billing_cc ?? undefined,
        subject,
        html: htmlBody,
      })
      // sendCoachHtmlEmail returns false on a transport failure (it only
      // throws on a missing token) — treat both as retryable: un-claim below.
      if (!delivered) throw new Error('Gmail send failed')

      // Log to communications (client_id null — billed at the account level).
      await supabase.from('communications').insert({
        coach_id: invoice.coach_id,
        client_id: null,
        type: 'reminder',
        direction: 'outbound',
        subject,
        status: 'sent',
      })

      // Pace the next rung from this send.
      await scheduleNextRung(supabase, invoice.id, kind)

      sent++
    } catch (e: any) {
      errors++
      // Un-claim so it retries next hour.
      await supabase
        .from('invoice_reminders')
        .update({ status: 'scheduled', sent_at: null })
        .eq('id', reminder.id)
    }
  }

  return { sent, errors }
}

// ── Copy per rung ─────────────────────────────────────────────────────────────

function reminderSubject(kind: string, period: string): string {
  const forPeriod = period || 'coaching services'
  switch (kind) {
    case 'overdue_1':
      return `Your invoice for ${forPeriod} is now past due`
    case 'overdue_2':
      return `Final reminder: your invoice for ${forPeriod} remains unpaid`
    default:
      return `Friendly reminder: invoice for ${forPeriod} is outstanding`
  }
}

function reminderBodyHtml(kind: string, period: string, total: string): string {
  const periodPhrase = period ? ` for <strong>${period}</strong>` : ''
  switch (kind) {
    case 'overdue_1':
      return `
            <p style="margin:0 0 16px;color:#3d2b1f;font-size:15px;line-height:1.6;">
              Our invoices are due on receipt, and your invoice${periodPhrase}
              in the amount of <strong>${total}</strong> is now past due.
            </p>
            <p style="margin:0 0 16px;color:#3d2b1f;font-size:15px;line-height:1.6;">
              If you've already arranged payment, thank you — please disregard this
              note. Otherwise, the button below takes you straight to the secure
              payment page.
            </p>`
    case 'overdue_2':
      return `
            <p style="margin:0 0 16px;color:#3d2b1f;font-size:15px;line-height:1.6;">
              Your invoice${periodPhrase} in the amount of <strong>${total}</strong>
              remains unpaid, and this is our final automated reminder.
            </p>
            <p style="margin:0 0 16px;color:#3d2b1f;font-size:15px;line-height:1.6;">
              If anything is standing in the way of payment, please just reply to
              this email — we'll sort it out together.
            </p>`
    default:
      return `
            <p style="margin:0 0 16px;color:#3d2b1f;font-size:15px;line-height:1.6;">
              This is a friendly reminder that your invoice${periodPhrase}
              in the amount of <strong>${total}</strong> remains outstanding.
            </p>`
  }
}

// ── Email templates ───────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function buildReminderEmail(opts: {
  kind: string
  accountName: string
  coachName: string
  coachEmail: string
  period: string
  total: string
  viewUrl?: string | null
  authUrl?: string | null
}): string {
  const authBlock = opts.authUrl
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#f7f5f1;border-radius:8px;">
         <tr><td style="padding:16px 20px;">
           <p style="margin:0 0 8px;color:#3d2b1f;font-size:14px;line-height:1.5;"><strong>Prefer to skip these reminders?</strong> Securely save a card and future coaching fees are handled automatically — no invoices to remember.</p>
           <p style="margin:0;"><a href="${opts.authUrl}" style="color:#111226;font-size:14px;font-weight:600;">Save a card for automatic billing →</a></p>
         </td></tr>
       </table>`
    : ''

  const closing = opts.kind === 'nudge_14d'
    ? `<p style="margin:0 0 24px;color:#3d2b1f;font-size:15px;line-height:1.6;">
              If you have any questions about this invoice or have already arranged payment,
              please disregard this message. We appreciate your continued partnership.
            </p>`
    : ''

  return `
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
              Dear ${esc(opts.accountName)},
            </p>
            ${reminderBodyHtml(opts.kind, opts.period, opts.total)}
            ${opts.viewUrl ? `<p style="margin:0 0 24px;">
              <a href="${opts.viewUrl}" style="display:inline-block;background:#111226;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;">View &amp; pay invoice</a>
            </p>` : ''}
            ${authBlock}
            ${closing}
            <p style="margin:0;color:#3d2b1f;font-size:15px;line-height:1.6;">
              Warmly,<br />
              <strong>${esc(opts.coachName)}</strong><br />
              <span style="color:#7a6e6a;font-size:13px;">theLeadershipWell</span>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9f7f4;padding:16px 32px;border-top:1px solid #e8e0d8;">
            <p style="margin:0;color:#7a6e6a;font-size:11px;text-align:center;">
              theLeadershipWell · ${esc(opts.coachEmail)}
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

/** Coach-facing "needs attention" notice — plain internal style, not branded client mail. */
function buildCoachAlertEmail(opts: {
  accountName: string
  billingEmail: string
  period: string
  total: string
  invoiceUrl: string
}): string {
  return `
<div style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:24px;">
  <p style="margin:0 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#b45309;">Needs attention</p>
  <h2 style="margin:0 0 2px;font-size:18px;color:#1a1f5e;">${esc(opts.accountName)}</h2>
  <p style="margin:0 0 16px;font-size:13px;color:#8a7f78;">${esc(opts.billingEmail)}</p>
  <p style="margin:0 0 16px;font-size:14px;color:#3B3328;line-height:1.6;">
    The invoice${opts.period ? ` for <strong>${esc(opts.period)}</strong>` : ''} in the amount of
    <strong>${opts.total}</strong> is still unpaid after three automated reminders.
    No further reminders will be sent — this one is worth a personal note or a call.
  </p>
  <p style="margin:0;font-size:13px;">
    <a href="${opts.invoiceUrl}" style="color:#1a1f5e;font-weight:600;">Open the invoice →</a>
  </p>
</div>`
}
