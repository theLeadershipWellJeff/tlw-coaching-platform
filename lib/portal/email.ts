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
  const privacyUrl = `${link.split('/portal/')[0]}/portal/privacy`
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
    <p style="margin:12px 0 0;font-size:13px;color:#6b6b73;">
      Before you sign in, here is
      <a href="${privacyUrl}" style="color:#F5821F;">how your report and conversations are handled</a>.
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

/**
 * Portal reminder emails (welcome / come-back / quarterly goals). Short, warm,
 * one button, a fresh sign-in link, and a line on how to switch reminders off.
 * Client voice standards: plain, no hype, no invented facts.
 */
export function buildReminderEmailHtml(opts: {
  firstName: string
  kind: 'welcome' | 'comeback' | 'quarterly_goals' | 'weekly_plan'
  link: string
  settingsLink: string
  coachName: string | null
}): string {
  const { firstName, kind, link, settingsLink, coachName } = opts
  const signoff = coachName ? `— ${escapeHtml(coachName)}` : '— theLeadershipWell'
  const copy: Record<typeof kind, { lead: string; body: string; button: string }> = {
    welcome: {
      lead: 'Your coaching portal is set up and waiting for you.',
      body: 'It holds your goals, anything shared with you, and an assistant that has read all of it. Ten minutes there is enough to see whether it is useful to you. This link signs you straight in — no password needed.',
      button: 'Open your portal',
    },
    comeback: {
      lead: 'It has been a little while since you were in your portal.',
      body: 'No pressure — it is there when you want it. A useful way back in: open the chat and ask what has moved since you last looked, or set the Top 5 for the week ahead. This link signs you straight in.',
      button: 'Pick up where you left off',
    },
    weekly_plan: {
      lead: 'A new week. Five things would make it a good one — which five?',
      body: 'Plan your week is a short conversation in your portal that ends in your Top 5, saved to your home page as a checklist. It draws on your goals, what got done last week, and anything you have noted since. Ten minutes, usually less.',
      button: 'Plan your week',
    },
    quarterly_goals: {
      lead: 'A new quarter has started, which makes this a good moment to look at your goals.',
      body: 'Open your portal and read them as they stand. Which one moved? Which one is done? Which one is not the right goal any more? Update the progress on each, retire what no longer fits, and add what the next three months are actually about. The assistant will think it through with you if you want a partner.',
      button: 'Review your goals',
    },
  }
  const c = copy[kind]
  return `
  <div style="font-family:Georgia,'Times New Roman',serif;color:#111226;line-height:1.55;">
    <p style="margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
    <p style="margin:0 0 12px;">${c.lead}</p>
    <p style="margin:0 0 20px;">${c.body}</p>
    <p style="margin:0 0 24px;">
      <a href="${link}"
         style="display:inline-block;background:#111226;color:#ffffff;text-decoration:none;
                padding:12px 22px;border-radius:8px;font-size:15px;font-family:Arial,Helvetica,sans-serif;">
        ${c.button}
      </a>
    </p>
    <p style="margin:0 0 8px;font-size:13px;color:#6b6b73;">
      Or paste this link into your browser:<br/>
      <a href="${link}" style="color:#F5821F;word-break:break-all;">${link}</a>
    </p>
    <p style="margin:20px 0 0;font-size:13px;color:#6b6b73;">
      This link works once and expires in 24 hours. You can switch these reminders off any time under
      <a href="${settingsLink}" style="color:#F5821F;">Settings</a> in your portal.
    </p>
    <p style="margin:20px 0 0;">${signoff}</p>
  </div>`
}
