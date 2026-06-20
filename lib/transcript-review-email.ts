/**
 * Notify the coach that an auto-ingested transcript couldn't be confidently
 * matched to a client, so it's waiting in the Practice review queue. This is the
 * "hold for review, but tell me" safety net for the unattended Zapier path —
 * without it, a transcript that misses the calendar match sits silently unscored.
 *
 * Uses the coach's stored Google refresh token (same unattended pattern as the
 * scorecard email). Best-effort: never throws into the ingest path.
 */
import { google } from 'googleapis'
import type { Coach } from './supabase/types'
import { getBaseUrl } from './url'
import { headerSafe, encodeHeaderValue } from './email-mime'

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function makeRawEmail(from: string, to: string, subject: string, html: string): string {
  const lines = [
    `From: theLeadershipWell <${from}>`,
    `To: ${headerSafe(to)}`,
    `Subject: ${encodeHeaderValue(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
  ]
  return Buffer.from(lines.join('\r\n')).toString('base64url')
}

export async function sendNeedsReviewEmail(
  coach: Coach,
  info: { filename?: string | null; sessionDate?: string | null; preview?: string | null }
): Promise<void> {
  const from = process.env.JEFF_FROM_EMAIL
  const to = (coach.email || '').trim()
  if (!from || !to || !coach.google_refresh_token) return

  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: coach.google_refresh_token })
  const gmail = google.gmail({ version: 'v1', auth })

  const url = `${getBaseUrl()}/practice`
  const when = info.sessionDate ? ` from ${esc(info.sessionDate)}` : ''
  const label = esc(info.filename || 'A recording')
  const preview = info.preview
    ? `<p style="font-size:13px;color:#403832;line-height:1.6;margin:0 0 18px;font-style:italic;">“${esc(
        info.preview
      )}”</p>`
    : ''

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;background:#DDD9D3;font-family:'DM Sans',Helvetica,Arial,sans-serif;color:#111226;">
  <div style="max-width:520px;margin:6vh auto 0;background:#fff;border-radius:16px;padding:36px 32px;box-shadow:0 10px 40px rgba(17,18,38,.08);">
    <p style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#8B8680;margin:0 0 14px;">theLeadershipWell</p>
    <h1 style="font-size:19px;font-weight:600;margin:0 0 12px;">A session needs a client assigned</h1>
    <p style="font-size:14px;color:#403832;line-height:1.6;margin:0 0 8px;">
      ${label}${when} came in but couldn't be matched to a client automatically, so it's
      waiting for you in the review queue. Assign the client and it'll score.
    </p>
    ${preview}
    <a href="${url}" style="display:inline-block;background:#0C1940;color:#FBF7F0;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:10px;">Review &amp; assign →</a>
  </div>
</body></html>`

  const raw = makeRawEmail(from, to, 'Action needed: a session transcript needs a client', html)
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
}
