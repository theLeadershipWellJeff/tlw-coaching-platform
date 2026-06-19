import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { z } from 'zod'
import { authOptions } from '@/lib/authOptions'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireClientCoach } from '@/lib/client-access'
import { readJson, toErrorResponse, ApiError } from '@/lib/api-handler'
import { headerSafe, encodeHeaderValue } from '@/lib/email-mime'
import { getActiveSignatureHtml } from '@/lib/signature'
import { htmlToPreview, logCommunication } from '@/lib/communications'

export const runtime = 'nodejs'

const SendSchema = z.object({
  clientId: z.string().uuid('A client is required.'),
  to: z.string().trim().min(1, 'A recipient (to) is required.'),
  cc: z.string().optional(),
  subject: z.string().trim().min(1, 'A subject is required.'),
  bodyHtml: z.string().min(1, 'The message body is empty.'),
})

function makeRawHtmlEmail(opts: {
  fromName: string
  fromEmail: string
  to: string
  cc?: string
  subject: string
  html: string
}): string {
  const lines = [`From: ${opts.fromName} <${opts.fromEmail}>`, `To: ${headerSafe(opts.to)}`]
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
 * Send a branded HTML email from a client's workspace, as the signed-in coach,
 * via the Gmail API. The signature is fetched and appended HERE (server-side) —
 * the client never supplies it. Every send is logged to `communications` (sent
 * or failed) so the Recent Communication card reflects it and a failure is never
 * silently dropped.
 *
 * Body: { clientId, to, cc?, subject, bodyHtml }. Pass cc: "" to suppress the Cc.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) throw new ApiError(401, 'Unauthorized')

    const { clientId, to, cc, subject, bodyHtml } = await readJson(req, SendSchema)

    const supabase = getSupabaseAdmin()
    // Tenant gate: 404 unless the coach is linked to this client. Returns the coach.
    const coach = await requireClientCoach(supabase, clientId)

    const ccAddr = cc === '' ? undefined : cc || process.env.JEFF_CC_EMAIL
    const signature = await getActiveSignatureHtml(supabase, coach.id)

    // Wrap the composed body in a base font, then append the signature. This is
    // the exact HTML that goes out AND what we log.
    const composedHtml =
      `<div style="font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#111226;">` +
      bodyHtml +
      `</div>` +
      signature

    const fromEmail = process.env.JEFF_FROM_EMAIL || coach.email
    const fromName = process.env.DEFAULT_COACH_NAME || coach.name

    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ access_token: session.accessToken as string })
    const gmail = google.gmail({ version: 'v1', auth })

    try {
      const raw = makeRawHtmlEmail({ fromName, fromEmail, to, cc: ccAddr, subject, html: composedHtml })
      const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })

      const row = await logCommunication(supabase, {
        coach_id: coach.id,
        client_id: clientId,
        type: 'email',
        direction: 'outbound',
        subject,
        preview: htmlToPreview(bodyHtml),
        body_html: composedHtml,
        status: 'sent',
        gmail_message_id: res.data.id ?? null,
      })

      return NextResponse.json({ success: true, communication: row })
    } catch (e: any) {
      // Never silently drop — record the failure so it surfaces on the card.
      await logCommunication(supabase, {
        coach_id: coach.id,
        client_id: clientId,
        type: 'email',
        direction: 'outbound',
        subject,
        preview: htmlToPreview(bodyHtml),
        body_html: composedHtml,
        status: 'failed',
        error_detail: e?.message || 'Gmail send failed',
      })
      return NextResponse.json({ error: e?.message || 'Failed to send email.' }, { status: 502 })
    }
  } catch (e) {
    return toErrorResponse(e)
  }
}
