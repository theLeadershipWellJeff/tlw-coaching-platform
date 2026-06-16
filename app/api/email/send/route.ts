import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { authOptions } from '@/lib/authOptions'
import { headerSafe, encodeHeaderValue } from '@/lib/email-mime'

export const runtime = 'nodejs'

function makeRawEmail(opts: {
  from: string
  to: string
  cc?: string
  subject: string
  body: string
}): string {
  const lines = [
    `From: Jeff Holmes <${opts.from}>`,
    `To: ${headerSafe(opts.to)}`,
  ]
  if (opts.cc) lines.push(`Cc: ${headerSafe(opts.cc)}`)
  lines.push(
    `Subject: ${encodeHeaderValue(opts.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    opts.body
  )
  return Buffer.from(lines.join('\r\n')).toString('base64url')
}

/**
 * Send a plain email from the app via Gmail. General-purpose (distinct from the
 * session-prep sender), used by the client workspace "send an email" button.
 * Defaults the Cc to JEFF_CC_EMAIL; pass cc: "" to suppress it.
 *
 * Body: { to, subject, body, cc? }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const to = (body.to || '').trim()
  const subject = (body.subject || '').trim()
  const text = body.body || ''
  if (!to) return NextResponse.json({ error: 'A recipient (to) is required.' }, { status: 400 })
  if (!subject) return NextResponse.json({ error: 'A subject is required.' }, { status: 400 })
  if (!text.trim()) return NextResponse.json({ error: 'The message body is empty.' }, { status: 400 })

  const cc = body.cc === '' ? undefined : body.cc || process.env.JEFF_CC_EMAIL

  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ access_token: session.accessToken as string })
  const gmail = google.gmail({ version: 'v1', auth })

  try {
    const raw = makeRawEmail({ from: process.env.JEFF_FROM_EMAIL!, to, cc, subject, body: text })
    const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
    return NextResponse.json({ success: true, id: res.data.id })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to send email.' }, { status: 502 })
  }
}
