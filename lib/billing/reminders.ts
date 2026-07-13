/**
 * Invoice reminder system.
 *
 * scheduleReminder(supabase, invoiceId)
 *   Called after an invoice is sent. Creates an invoice_reminders row
 *   with send_at = sent_at + 14 days (idempotent — skips if one already exists).
 *
 * sendDueReminders(supabase)
 *   Called by the hourly cron. Finds every scheduled reminder whose send_at
 *   has passed, claims it (unique index on invoice_id prevents double-fire),
 *   sends a branded Gmail, and logs to communications.
 *
 * cancelReminders(supabase, invoiceId)
 *   Cancels all scheduled reminders for an invoice (called on paid/void).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendCoachHtmlEmail } from '@/lib/gmail'
import { getBaseUrl } from '@/lib/url'

const REMINDER_DAYS = 14

// ── Schedule ──────────────────────────────────────────────────────────────────

export async function scheduleReminder(
  supabase: SupabaseClient,
  invoiceId: string,
): Promise<void> {
  // Load invoice to get sent_at and coach_id.
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, coach_id, sent_at, status, billing_accounts ( name, billing_email )')
    .eq('id', invoiceId)
    .maybeSingle()

  if (!invoice || invoice.status !== 'sent') return

  const sentAt = invoice.sent_at ? new Date(invoice.sent_at) : new Date()
  const sendAt = new Date(sentAt.getTime() + REMINDER_DAYS * 24 * 60 * 60 * 1000)

  // Idempotent — skip if a scheduled reminder already exists for this invoice.
  const { data: existing } = await supabase
    .from('invoice_reminders')
    .select('id')
    .eq('invoice_id', invoiceId)
    .eq('status', 'scheduled')
    .limit(1)
    .maybeSingle()

  if (existing) return

  await supabase.from('invoice_reminders').insert({
    invoice_id: invoiceId,
    send_at: sendAt.toISOString(),
    status: 'scheduled',
    channel: 'email',
  })
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
      invoices!inner (
        id,
        coach_id,
        total,
        currency,
        period_start,
        period_end,
        status,
        receipt_token,
        billing_accounts ( name, billing_email )
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

    // Only send for invoices that are still outstanding.
    if (!['sent', 'overdue'].includes(invoice.status)) {
      // Auto-cancel reminder for paid/void invoices.
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

    // Load coach email for Gmail send.
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

    const subject = `Friendly reminder: invoice for ${period || 'coaching services'} is outstanding`
    const htmlBody = buildReminderEmail({
      accountName: account?.name ?? 'Client',
      billingEmail: account?.billing_email ?? '',
      period,
      total: totalFormatted,
      // Tracked view link (marks the invoice received, then redirects to the
      // Stripe hosted payment page). Absent for pre-037 invoices.
      viewUrl: invoice.receipt_token
        ? `${getBaseUrl()}/api/billing/invoices/receipt/${invoice.receipt_token}`
        : null,
    })

    try {
      await sendCoachHtmlEmail(coach, {
        to: account?.billing_email ?? '',
        subject,
        html: htmlBody,
      })

      // Log to communications.
      await supabase.from('communications').insert({
        coach_id: invoice.coach_id,
        client_id: null,
        type: 'reminder',
        direction: 'outbound',
        subject,
        status: 'sent',
      })

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

// ── Email template ────────────────────────────────────────────────────────────

function buildReminderEmail(opts: {
  accountName: string
  billingEmail: string
  period: string
  total: string
  viewUrl?: string | null
}): string {
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
              Dear ${opts.accountName},
            </p>
            <p style="margin:0 0 16px;color:#3d2b1f;font-size:15px;line-height:1.6;">
              This is a friendly reminder that your invoice${opts.period ? ` for <strong>${opts.period}</strong>` : ''}
              in the amount of <strong>${opts.total}</strong> remains outstanding.
            </p>
            ${opts.viewUrl ? `<p style="margin:0 0 24px;">
              <a href="${opts.viewUrl}" style="display:inline-block;background:#111226;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;">View &amp; pay invoice</a>
            </p>` : ''}
            <p style="margin:0 0 24px;color:#3d2b1f;font-size:15px;line-height:1.6;">
              If you have any questions about this invoice or have already arranged payment,
              please disregard this message. We appreciate your continued partnership.
            </p>
            <p style="margin:0;color:#3d2b1f;font-size:15px;line-height:1.6;">
              Warmly,<br />
              <strong>Dr. Jeff Holmes</strong><br />
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
}
