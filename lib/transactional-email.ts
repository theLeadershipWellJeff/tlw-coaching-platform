/**
 * Transactional email transport for the client portal (Resend).
 *
 * Why this exists: the coach's Gmail cannot carry cohort-scale portal
 * invitations (~113 seats across multiple companies) — deliverability failure
 * there is silent and per-account send limits apply. Portal-system mail (magic
 * links, invitations, support replies) goes out through a transactional
 * provider on a verified subdomain of theleadershipwell.online (SPF + DKIM +
 * DMARC), while COACH-authored mail to coaching clients stays on Gmail,
 * untouched (`lib/gmail.ts#sendCoachHtmlEmail`).
 *
 * Until the provider is configured this module falls back to the coach's
 * Gmail, so nothing changes for today's portal. Configure with:
 *   RESEND_API_KEY      — API key from resend.com
 *   PORTAL_FROM_EMAIL   — verified sender, e.g. portal@mail.theleadershipwell.online
 *   PORTAL_FROM_NAME    — optional display name (default "theLeadershipWell")
 *
 * Dependency-free (plain fetch), mirroring lib/vault/client.ts.
 */
import type { Coach } from '@/lib/supabase/types'
import { sendCoachHtmlEmail } from '@/lib/gmail'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

export function transactionalEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.PORTAL_FROM_EMAIL)
}

export type TransactionalEmailOpts = {
  to: string
  subject: string
  html: string
  /** Replies go to a person (the coach), not the sending subdomain. */
  replyTo?: string
  /** Display name on the From header; the address is always PORTAL_FROM_EMAIL. */
  fromName?: string
}

/**
 * Send through the transactional provider. Returns false on any failure
 * (callers treat portal email as best-effort, same contract as
 * sendCoachHtmlEmail). Throws only if called while unconfigured.
 */
export async function sendTransactionalEmail(opts: TransactionalEmailOpts): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.PORTAL_FROM_EMAIL
  if (!apiKey || !fromEmail) {
    throw new Error('Transactional email is not configured (RESEND_API_KEY / PORTAL_FROM_EMAIL).')
  }
  const fromName = opts.fromName || process.env.PORTAL_FROM_NAME || 'theLeadershipWell'
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error(`Resend send failed (${res.status}):`, detail.slice(0, 500))
      return false
    }
    return true
  } catch (e) {
    console.error('Resend send failed:', e)
    return false
  }
}

/**
 * The one send path for portal-system mail (magic links, invitations, support
 * replies). Provider when configured — From the verified portal subdomain,
 * display-named and reply-to'd to the coach when there is one — else the
 * coach's Gmail exactly as before. `coach` may be null only for coach-less
 * portal participants; those sends REQUIRE the provider (there is no Gmail to
 * fall back to) and return false until it is configured.
 */
export async function sendPortalEmail(
  coach: Coach | null,
  opts: { to: string; subject: string; html: string }
): Promise<boolean> {
  if (transactionalEmailConfigured()) {
    return sendTransactionalEmail({
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      replyTo: coach?.email || undefined,
      fromName: coach?.name || undefined,
    })
  }
  if (!coach) {
    console.error('sendPortalEmail: no coach to fall back to and no transactional provider configured.')
    return false
  }
  return sendCoachHtmlEmail(coach, { to: opts.to, cc: '', subject: opts.subject, html: opts.html })
}
