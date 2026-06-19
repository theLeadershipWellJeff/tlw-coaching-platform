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

function makeRawHtmlEmail(opts: { from: string; to: string; cc?: string; subject: string; html: string }): string {
  const lines = [`From: ${process.env.DEFAULT_COACH_NAME || 'Jeff Holmes'} <${opts.from}>`, `To: ${headerSafe(opts.to)}`]
  if (opts.cc) lines.push(`Cc: ${headerSafe(opts.cc)}`)
  lines.push(
    `Subject: ${encodeHeaderValue(opts.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    opts.html
  )
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
  opts: { to: string; cc?: string; subject: string; html: string }
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
    })
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
    return true
  } catch (e) {
    console.error('Gmail send (coach refresh token) failed:', e)
    return false
  }
}
