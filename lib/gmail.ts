/**
 * Send an HTML email as the coach using their stored Google refresh token.
 *
 * Unlike the interactive sends (which use the signed-in session's access token),
 * this works server-side with no session — so the reminder cron can email a
 * client a nudge hours before a session with nobody logged in. The same path
 * also backs the booking confirmation, so scheduling has a single send route.
 * Requires the `gmail.send` scope on the coach's refresh token (granted at
 * sign-in).
 */
import { google } from 'googleapis'
import type { Coach } from './supabase/types'
import { headerSafe, encodeHeaderValue } from './email-mime'

export type EmailAttachment = {
  filename: string
  contentType: string // e.g. 'application/pdf'
  content: Buffer
}

function makeRawHtmlEmail(opts: {
  from: string
  to: string
  cc?: string
  subject: string
  html: string
  attachments?: EmailAttachment[]
}): string {
  const lines = [`From: ${process.env.DEFAULT_COACH_NAME || 'Jeff Holmes'} <${opts.from}>`, `To: ${headerSafe(opts.to)}`]
  if (opts.cc) lines.push(`Cc: ${headerSafe(opts.cc)}`)
  lines.push(`Subject: ${encodeHeaderValue(opts.subject)}`, 'MIME-Version: 1.0')

  const attachments = opts.attachments || []
  if (attachments.length === 0) {
    lines.push('Content-Type: text/html; charset=UTF-8', '', opts.html)
    return Buffer.from(lines.join('\r\n')).toString('base64url')
  }

  // multipart/mixed: the HTML body part followed by each attachment, base64,
  // wrapped at 76 chars per RFC 2045.
  const boundary = 'tlw_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
  lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`, '')
  lines.push(`--${boundary}`, 'Content-Type: text/html; charset=UTF-8', '', opts.html)
  for (const att of attachments) {
    // Header-safe filename: strip quotes/CR/LF so a hostile name can't break MIME.
    const safeName = att.filename.replace(/["\r\n]/g, '').slice(0, 180) || 'attachment'
    const b64 = att.content.toString('base64').replace(/(.{76})/g, '$1\r\n')
    lines.push(
      `--${boundary}`,
      `Content-Type: ${att.contentType}; name="${safeName}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${safeName}"`,
      '',
      b64
    )
  }
  lines.push(`--${boundary}--`)
  return Buffer.from(lines.join('\r\n')).toString('base64url')
}

/**
 * Send an HTML email as `coach`. Returns true on success. Throws only on a
 * missing refresh token (a setup problem worth surfacing); transport failures
 * are logged and returned as false so a batch (e.g. the reminder cron) can keep
 * going past one bad address.
 */
export async function sendCoachHtmlEmail(
  coach: Coach,
  opts: { to: string; cc?: string; subject: string; html: string; attachments?: EmailAttachment[] }
): Promise<boolean> {
  if (!coach.google_refresh_token) {
    throw new Error('Coach has no Google refresh token — sign out and back in to grant email access.')
  }
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: coach.google_refresh_token })
  const gmail = google.gmail({ version: 'v1', auth })

  try {
    const raw = makeRawHtmlEmail({
      from: process.env.JEFF_FROM_EMAIL!,
      to: opts.to,
      cc: opts.cc,
      subject: opts.subject,
      html: opts.html,
      attachments: opts.attachments,
    })
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
    return true
  } catch (e) {
    console.error('Gmail send (coach refresh token) failed:', e)
    return false
  }
}
