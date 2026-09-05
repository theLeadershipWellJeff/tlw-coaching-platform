/**
 * The ONE send path for Client Portal auth mail — magic links and invitations.
 *
 * Transport choice:
 *   1. Resend (lib/email/transactional.ts) when configured — the verified
 *      subdomain, built for cohort-scale invitations. Reply-To is the client's
 *      coach when they have one, so a reply still reaches a person.
 *   2. Otherwise the client's coach's Gmail (today's behavior) — keeps local
 *      dev and any coach-only install working with no new env.
 *
 * A client with NO coach (a standalone assessment participant) can only be
 * reached through Resend; with it unconfigured the send fails loud so the
 * gap is visible instead of a silent non-delivery.
 *
 * Every send, success or failure, is logged to `communications` so it shows on
 * the client's Recent Communication card and a failed invite is never lost.
 */
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { sendCoachHtmlEmail } from '@/lib/gmail'
import { logCommunication } from '@/lib/communications'
import { isTransactionalEmailConfigured, sendTransactionalEmail } from '@/lib/email/transactional'
import { resolveClientCoach } from './coach'
import { buildMagicLinkEmailHtml } from './email'
import type { Coach } from '@/lib/supabase/types'

export type PortalMailKind = 'login_link' | 'invite'

export type PortalSendResult = {
  ok: boolean
  /** 'resend' | 'gmail' — which transport carried it. */
  via: 'resend' | 'gmail' | 'none'
  error?: string
}

/**
 * Email a sign-in link to a portal client.
 *
 * `coach` is the client's coach when the caller already has it (invite routes);
 * otherwise it is resolved. `sender` overrides the Gmail account used on the
 * fallback path (the supervisor's on-behalf resend) — ignored when Resend is on.
 */
export async function sendPortalLoginEmail(opts: {
  client: { id: string; name: string | null; email: string }
  link: string
  kind: PortalMailKind
  coach?: Coach | null
  sender?: Coach | null
  /** communications.coach_id attribution (defaults to the resolved coach). */
  attributeToCoachId?: string | null
}): Promise<PortalSendResult> {
  const supabase = getSupabaseAdmin()
  const coach = opts.coach === undefined ? await resolveClientCoach(opts.client.id) : opts.coach
  const firstName = (opts.client.name || '').split(' ')[0] || 'there'
  const subject = opts.kind === 'invite' ? 'Your coaching portal invitation' : 'Your sign-in link'
  const html = buildMagicLinkEmailHtml({
    firstName,
    link: opts.link,
    coachName: coach?.name || null,
  })

  let result: PortalSendResult
  if (isTransactionalEmailConfigured()) {
    const r = await sendTransactionalEmail({
      to: opts.client.email,
      subject,
      html,
      replyTo: coach?.email || undefined,
    })
    result = r.ok ? { ok: true, via: 'resend' } : { ok: false, via: 'resend', error: r.error }
  } else {
    const gmailSender = opts.sender?.google_refresh_token ? opts.sender : coach
    if (!gmailSender?.google_refresh_token) {
      result = {
        ok: false,
        via: 'none',
        error: coach
          ? 'The coach has no Gmail access on file — sign out and back in.'
          : 'This client has no coach and transactional email is not configured.',
      }
    } else {
      try {
        const sent = await sendCoachHtmlEmail(gmailSender, {
          to: opts.client.email,
          cc: '',
          subject,
          html,
        })
        result = sent ? { ok: true, via: 'gmail' } : { ok: false, via: 'gmail', error: 'Gmail send failed' }
      } catch (e) {
        result = { ok: false, via: 'gmail', error: e instanceof Error ? e.message : String(e) }
      }
    }
  }

  await logCommunication(supabase, {
    coach_id: opts.attributeToCoachId ?? coach?.id ?? null,
    client_id: opts.client.id,
    type: 'email',
    direction: 'outbound',
    subject,
    preview: opts.kind === 'invite' ? 'Client Portal invitation' : 'Client Portal sign-in link',
    body_html: null,
    status: result.ok ? 'sent' : 'failed',
    error_detail: result.ok ? null : result.error ?? 'send failed',
  } as any)

  return result
}
