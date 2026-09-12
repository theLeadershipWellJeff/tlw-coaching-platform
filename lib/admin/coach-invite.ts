/**
 * Coach sign-in invitation — the Command Center's "Send invite" / "Re-send
 * invite" for a COACH (not a client).
 *
 * There is no token to mint: coach sign-in is Google OAuth, and the `coaches`
 * table is the allowlist (lib/authOptions.ts#signIn). So the invite is simply a
 * branded email that (1) tells the coach their account exists, (2) names the
 * EXACT Google account they must use — the row's email is what the gate
 * matches — and (3) links straight to the Google sign-in. Transport mirrors
 * lib/portal/send.ts: Resend when configured (Reply-To the acting
 * supervisor), else the acting supervisor's Gmail. The send is recorded in
 * `admin_audit_log` (action `coach_invite_sent`), which is also where the
 * Command Center reads "last invited" from — no coach column needed.
 */
import { sendCoachHtmlEmail } from '@/lib/gmail'
import { isTransactionalEmailConfigured, sendTransactionalEmail } from '@/lib/email/transactional'
import { getBaseUrl } from '@/lib/url'
import type { Coach } from '@/lib/supabase/types'

export type CoachInviteResult = {
  ok: boolean
  via: 'resend' | 'gmail' | 'none'
  error?: string
  warning?: string
}

/** Where the button lands: NextAuth's Google sign-in, returning to the dashboard. */
export function coachSignInLink(): string {
  const base = getBaseUrl()
  return `${base}/api/auth/signin?callbackUrl=${encodeURIComponent(`${base}/dashboard`)}`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function buildCoachInviteEmailHtml(opts: {
  firstName: string
  coachEmail: string
  link: string
  fromName: string
  /** True on a re-send to someone who has already signed in once. */
  returning: boolean
}): string {
  const { firstName, coachEmail, link, fromName, returning } = opts
  const lead = returning
    ? 'Here is a fresh link to sign back in to your theLeadershipWell coaching platform account.'
    : 'Your theLeadershipWell coaching platform account is set up and ready for you.'
  return `
<div style="font-family:Georgia,'Times New Roman',serif;color:#111226;line-height:1.55;max-width:540px;">
  <p style="margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
  <p style="margin:0 0 16px;">${lead}</p>
  <p style="margin:0 0 16px;">Sign in with Google using <strong>${escapeHtml(coachEmail)}</strong> — that exact address is the one your account is registered to, so another Google account will be turned away.</p>
  <p style="margin:0 0 20px;">
    <a href="${link}"
       style="display:inline-block;background:#1a1f5e;color:#ffffff;padding:11px 22px;border-radius:6px;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;">
      Sign in to the platform
    </a>
  </p>
  <p style="margin:0 0 8px;font-size:13px;color:#6b6b73;">
    Or paste this link into your browser:<br/>
    <a href="${link}" style="color:#F5821F;word-break:break-all;">${link}</a>
  </p>
  <p style="margin:16px 0 0;font-size:13px;color:#6b6b73;">
    On your first sign-in Google will ask you to allow access to Gmail and Calendar. That is what lets the platform send session notes and book sessions from your own account — nothing goes out unless you send it.
  </p>
  <p style="margin:20px 0 0;">— ${escapeHtml(fromName)}</p>
</div>`
}

/**
 * Send the invite. `actor` is the supervisor clicking the button — the
 * Reply-To on Resend, and the Gmail sender on the fallback.
 */
export async function sendCoachInviteEmail(opts: {
  coach: Pick<Coach, 'id' | 'name' | 'email' | 'google_refresh_token'>
  /** The supervisor clicking the button; `sender` is the same thing by another name for system callers (null = no Gmail path). */
  actor?: Coach | null
  sender?: Coach | null
}): Promise<CoachInviteResult> {
  const { coach } = opts
  const actor = opts.actor ?? opts.sender ?? null
  if (!coach.email) return { ok: false, via: 'none', error: 'This coach has no email on file.' }

  const firstName = (coach.name || '').split(' ')[0] || 'there'
  const fromName = actor?.name || process.env.DEFAULT_COACH_NAME || 'theLeadershipWell'
  const subject = coach.google_refresh_token
    ? 'Your theLeadershipWell platform sign-in link'
    : 'Your theLeadershipWell coaching platform account is ready'
  const html = buildCoachInviteEmailHtml({
    firstName,
    coachEmail: coach.email,
    link: coachSignInLink(),
    fromName,
    returning: !!coach.google_refresh_token,
  })

  async function viaGmail(): Promise<CoachInviteResult> {
    if (!actor?.google_refresh_token) {
      return {
        ok: false,
        via: 'none',
        error: 'Your own account has no Gmail access on file — sign out and back in, or configure transactional email.',
      }
    }
    try {
      const sent = await sendCoachHtmlEmail(actor, { to: coach.email, cc: '', subject, html })
      return sent ? { ok: true, via: 'gmail' } : { ok: false, via: 'gmail', error: 'Gmail send failed' }
    } catch (e) {
      return { ok: false, via: 'gmail', error: e instanceof Error ? e.message : String(e) }
    }
  }

  if (!isTransactionalEmailConfigured()) return viaGmail()

  const r = await sendTransactionalEmail({ to: coach.email, subject, html, replyTo: actor?.email || undefined })
  if (r.ok) return { ok: true, via: 'resend' }
  // Resend refused — carry it over Gmail and say so (same rule as portal mail).
  const g = await viaGmail()
  if (g.ok) return { ...g, warning: `Sent via Gmail because the transactional address failed: ${r.error}` }
  return { ok: false, via: g.via, error: `Transactional send failed (${r.error}); Gmail fallback failed too (${g.error})` }
}
