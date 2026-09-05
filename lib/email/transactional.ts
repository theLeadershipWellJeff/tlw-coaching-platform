/**
 * Transactional email transport (Resend) — the deliverability path for portal
 * sign-in links, invitations, and support replies at cohort scale.
 *
 * Why this exists alongside lib/gmail.ts: coach-to-client mail rightly goes out
 * from the coach's own Gmail (it lands in their Sent folder and reads as a
 * personal note). Cohort invitations do not — ~100 near-identical links from a
 * personal Gmail account in a morning is exactly the pattern that lands in spam,
 * and Gmail never tells you. Resend sends from a verified subdomain with SPF,
 * DKIM, and DMARC, which is what corporate inboxes check.
 *
 * Deliberately a bare `fetch` against Resend's REST API — no SDK dependency
 * (same pattern as lib/vault/client.ts). Coach-initiated client email keeps
 * using sendCoachHtmlEmail; do NOT route it through here.
 *
 * Env: RESEND_API_KEY, PORTAL_FROM_EMAIL (e.g. portal@mail.theleadershipwell.online),
 * optional PORTAL_FROM_NAME (default "theLeadershipWell").
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

export type TransactionalEmail = {
  to: string
  subject: string
  html: string
  /** Replies go to a person (the client's coach, or support), never the no-reply sender. */
  replyTo?: string
}

export type TransactionalResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string }

/** True when the transport is configured; callers fall back to Gmail otherwise. */
export function isTransactionalEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.PORTAL_FROM_EMAIL)
}

function fromHeader(): string {
  const name = (process.env.PORTAL_FROM_NAME || 'theLeadershipWell').replace(/["\r\n]/g, '')
  return `${name} <${process.env.PORTAL_FROM_EMAIL}>`
}

/**
 * Send one email through Resend. Never throws — a transport failure comes back
 * as `{ ok: false, error }` so the caller can log it to `communications` and
 * decide (a magic-link request stays generic; a coach-initiated invite surfaces
 * the failure).
 */
export async function sendTransactionalEmail(msg: TransactionalEmail): Promise<TransactionalResult> {
  if (!isTransactionalEmailConfigured()) {
    return { ok: false, error: 'Transactional email is not configured (RESEND_API_KEY / PORTAL_FROM_EMAIL).' }
  }
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromHeader(),
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      const error = `Resend ${res.status}: ${detail.slice(0, 300)}`
      console.error('Transactional email failed:', error)
      return { ok: false, error }
    }
    const body = (await res.json().catch(() => ({}))) as { id?: string }
    return { ok: true, id: body.id ?? null }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('Transactional email failed:', error)
    return { ok: false, error }
  }
}
