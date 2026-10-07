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
 * When Resend is configured but refuses a send (unverified domain, bad key,
 * outage) the message is carried over Gmail instead and the result carries a
 * `warning` naming the Resend error, so a dry run is never blocked on DNS
 * while the problem stays visible. A client with NO coach (a standalone
 * assessment participant) can only be reached through Resend; with it
 * unconfigured or failing the send fails loud.
 *
 * Every send, success or failure, is logged to `communications` so it shows on
 * the client's Recent Communication card and a failed invite is never lost.
 */
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { sendCoachHtmlEmail } from '@/lib/gmail'
import { logCommunication } from '@/lib/communications'
import { isTransactionalEmailConfigured, sendTransactionalEmail } from '@/lib/email/transactional'
import { resolveClientCoach } from './coach'
import { buildMagicLinkEmailHtml, portalInviteContextLine } from './email'
import type { Coach } from '@/lib/supabase/types'

export type PortalMailKind = 'login_link' | 'invite'

export type PortalSendResult = {
  ok: boolean
  /** 'resend' | 'gmail' — which transport carried it. */
  via: 'resend' | 'gmail' | 'none'
  error?: string
  /** Set when the send succeeded on a fallback transport — worth surfacing. */
  warning?: string
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
  const coach = opts.coach === undefined ? await resolveClientCoach(opts.client.id) : opts.coach
  const firstName = (opts.client.name || '').split(' ')[0] || 'there'
  const subject = opts.kind === 'invite' ? 'Your coaching portal invitation' : 'Your sign-in link'
  const about = await loadInviteFacts(opts.client.id, opts.kind === 'invite')
  const html = buildMagicLinkEmailHtml({
    firstName,
    link: opts.link,
    // A portal-only participant's house-coach link is structural: the firm
    // signs off, as the reminder emails already do.
    coachName: about.clientType === 'portal' ? null : coach?.name || null,
    contextLine: opts.kind === 'invite' ? portalInviteContextLine({ companyName: about.companyName, hasReport: about.hasReport }) : null,
    // Invitations last 14 days, a requested sign-in link 24 hours (lib/portal/tokens.ts).
    expiresIn: opts.kind === 'invite' ? '14 days' : '24 hours',
  })
  return deliverPortalEmail({
    client: opts.client,
    coach,
    sender: opts.sender,
    subject,
    html,
    type: 'email',
    preview: opts.kind === 'invite' ? 'Client Portal invitation' : 'Client Portal sign-in link',
    attributeToCoachId: opts.attributeToCoachId,
  })
}

/**
 * What the invitation needs to know about the client: client_type (for the
 * sign-off) and, for an invitation, the company name and whether a completed
 * 360 is on file (for the context line). Best-effort — a failed read just
 * means the plain email.
 */
async function loadInviteFacts(
  clientId: string,
  forInvite: boolean
): Promise<{ clientType: string | null; companyName: string | null; hasReport: boolean }> {
  const out = { clientType: null as string | null, companyName: null as string | null, hasReport: false }
  try {
    const supabase = getSupabaseAdmin()
    const { data: c } = await supabase.from('clients').select('client_type, company_id, portal_features').eq('id', clientId).maybeSingle()
    if (!c) return out
    out.clientType = c.client_type
    if (!forInvite) return out
    const [company, report] = await Promise.all([
      c.company_id ? supabase.from('companies').select('name').eq('id', c.company_id).maybeSingle() : Promise.resolve({ data: null }),
      (c.portal_features as { assessments?: boolean } | null)?.assessments === true
        ? supabase
            .from('client_documents')
            .select('id', { count: 'exact', head: true })
            .eq('client_id', clientId)
            .eq('kind', 'assessment_360')
            .eq('extraction_status', 'complete')
        : Promise.resolve({ count: 0 }),
    ])
    out.companyName = (company.data as { name?: string } | null)?.name ?? null
    out.hasReport = ((report as { count?: number | null }).count ?? 0) > 0
  } catch {
    /* plain email */
  }
  return out
}

/**
 * Any client-facing portal email over the same transport (Resend, else the
 * coach's Gmail) with the same communications logging. Used for sign-in
 * links and for the portal reminders. `coach` = the client's coach when
 * already resolved (null = none).
 */
export async function deliverPortalEmail(opts: {
  client: { id: string; name: string | null; email: string }
  coach: Coach | null
  sender?: Coach | null
  subject: string
  html: string
  /** communications.type — 'email' for sign-in links, 'reminder' for portal reminders. */
  type: 'email' | 'reminder'
  preview: string
  attributeToCoachId?: string | null
}): Promise<PortalSendResult> {
  const supabase = getSupabaseAdmin()
  const { coach, subject, html } = opts

  // Gmail fallback sender: the explicit on-behalf sender when they have Gmail
  // access, else the client's coach (the house coach for portal participants).
  const gmailSender = opts.sender?.google_refresh_token ? opts.sender : coach?.google_refresh_token ? coach : null

  async function viaGmail(): Promise<PortalSendResult> {
    if (!gmailSender) {
      return {
        ok: false,
        via: 'none',
        error: coach
          ? 'The coach has no Gmail access on file — sign out and back in.'
          : 'This client has no coach and transactional email is not configured.',
      }
    }
    try {
      const sent = await sendCoachHtmlEmail(gmailSender, { to: opts.client.email, cc: '', subject, html })
      return sent ? { ok: true, via: 'gmail' } : { ok: false, via: 'gmail', error: 'Gmail send failed' }
    } catch (e) {
      return { ok: false, via: 'gmail', error: e instanceof Error ? e.message : String(e) }
    }
  }

  let result: PortalSendResult
  if (isTransactionalEmailConfigured()) {
    const r = await sendTransactionalEmail({ to: opts.client.email, subject, html, replyTo: coach?.email || undefined })
    if (r.ok) {
      result = { ok: true, via: 'resend' }
    } else if (gmailSender) {
      // Resend refused (an unverified domain, a bad key, an outage). Don't
      // strand the client: carry it over Gmail and say so, so the Resend
      // problem is visible without blocking the invite.
      const g = await viaGmail()
      result = g.ok
        ? { ...g, warning: `Sent via Gmail because the portal address failed: ${r.error}` }
        : { ok: false, via: 'gmail', error: `Portal address failed (${r.error}); Gmail fallback failed too (${g.error})` }
    } else {
      result = { ok: false, via: 'resend', error: r.error }
    }
  } else {
    result = await viaGmail()
  }

  await logCommunication(supabase, {
    coach_id: opts.attributeToCoachId ?? coach?.id ?? null,
    client_id: opts.client.id,
    type: opts.type,
    direction: 'outbound',
    subject,
    preview: opts.preview,
    body_html: null,
    status: result.ok ? 'sent' : 'failed',
    error_detail: result.ok ? result.warning ?? null : result.error ?? 'send failed',
  } as any)

  return result
}
