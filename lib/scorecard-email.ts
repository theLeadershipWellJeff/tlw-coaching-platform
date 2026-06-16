/**
 * Send a coach their scored-session scorecard by email.
 *
 * Uses the coach's stored Google refresh token (not a live session) so it works
 * from the unattended ingest webhook as well as the in-app score flows — the
 * same pattern as the calendar reader. The Gmail send scope is granted at
 * sign-in (see authOptions); a coach with no refresh token yet can't be emailed.
 */
import { google } from 'googleapis'
import type { Coach } from './supabase/types'
import type { SessionReportJson } from './scoring/types'
import { buildScorecardEmailHTML } from './scorecard-email-template'
import { headerSafe, encodeHeaderValue } from './email-mime'

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

export async function sendScorecardEmail(
  coach: Coach,
  report: SessionReportJson,
  opts?: { to?: string }
): Promise<string | null> {
  const from = process.env.JEFF_FROM_EMAIL
  if (!from) throw new Error('JEFF_FROM_EMAIL is not configured.')
  if (!coach.google_refresh_token) {
    throw new Error('Coach has no Google refresh token — sign out and back in to grant access.')
  }
  const to = (opts?.to || coach.email || '').trim()
  if (!to) throw new Error('No recipient email address.')

  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: coach.google_refresh_token })
  const gmail = google.gmail({ version: 'v1', auth })

  const html = buildScorecardEmailHTML(report)
  const subject = `Session scorecard · ${report.session.client_initials || '—'} · ${report.band.toLowerCase()} ${report.overall_score.toFixed(
    1
  )}`
  const raw = makeRawEmail(from, to, subject, html)

  const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
  return res.data.id ?? null
}
