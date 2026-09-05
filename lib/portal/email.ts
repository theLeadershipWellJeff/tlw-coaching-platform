/**
 * The client-facing magic-link sign-in email. Email-safe inline styles only.
 * Sent via lib/portal/send.ts (Resend, or the coach's Gmail as fallback).
 * `coachName` is null for a client with no coach (a standalone assessment
 * participant) — the sign-off is then the firm, not a person.
 */
export function buildMagicLinkEmailHtml(opts: {
  firstName: string
  link: string
  coachName: string | null
}): string {
  const { firstName, link, coachName } = opts
  const signoff = coachName ? `— ${escapeHtml(coachName)}` : '— theLeadershipWell'
  return `
  <div style="font-family:Georgia,'Times New Roman',serif;color:#111226;line-height:1.55;">
    <p style="margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
    <p style="margin:0 0 20px;">Here's your secure link to sign in to your coaching portal:</p>
    <p style="margin:0 0 24px;">
      <a href="${link}"
         style="display:inline-block;background:#111226;color:#ffffff;text-decoration:none;
                padding:12px 22px;border-radius:8px;font-size:15px;font-family:Arial,Helvetica,sans-serif;">
        Sign in to your portal
      </a>
    </p>
    <p style="margin:0 0 8px;font-size:13px;color:#6b6b73;">
      Or paste this link into your browser:<br/>
      <a href="${link}" style="color:#F5821F;word-break:break-all;">${link}</a>
    </p>
    <p style="margin:20px 0 0;font-size:13px;color:#6b6b73;">
      This link works once and expires in 24 hours. If you didn't request it, you can ignore this email.
    </p>
    <p style="margin:20px 0 0;">${signoff}</p>
  </div>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
