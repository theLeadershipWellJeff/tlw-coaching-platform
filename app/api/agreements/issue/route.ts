import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { z } from 'zod'
import { authOptions } from '@/lib/authOptions'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireClientCoach } from '@/lib/client-access'
import { readJson, toErrorResponse, ApiError } from '@/lib/api-handler'
import { getOrCreateAgreementTemplate } from '@/lib/agreement-store'
import { renderAgreementHtml } from '@/lib/agreement-template'
import { buildAgreementEmailHTML } from '@/lib/agreement-email'
import { getBaseUrl } from '@/lib/url'
import { headerSafe, encodeHeaderValue } from '@/lib/email-mime'

export const runtime = 'nodejs'

const TOKEN_TTL_DAYS = 30

const IssueSchema = z.object({
  clientId: z.string().uuid(),
  clientName: z.string().trim().min(1),
  clientEmail: z.string().trim().email(),
  coachName: z.string().trim().optional(),
  zoomLink: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  paymentTerms: z.string().nullable().optional(),
})

function makeRawHtmlEmail(opts: { from: string; to: string; cc?: string; subject: string; html: string }): string {
  const lines = [`From: Jeff Holmes <${opts.from}>`, `To: ${headerSafe(opts.to)}`]
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
 * Issue the master agreement to a client: capture the per-client merge values,
 * snapshot the fully-rendered document, generate a 30-day magic-link token, and
 * email the client a CTA to the signing page. Sent as the signed-in coach.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) throw new ApiError(401, 'Unauthorized')

    const supabase = getSupabaseAdmin()
    const body = await readJson(req, IssueSchema)
    const coach = await requireClientCoach(supabase, body.clientId)

    const template = await getOrCreateAgreementTemplate(supabase, coach)

    const vars = {
      client_name: body.clientName,
      coach_name: body.coachName || coach.name,
      zoom_link: body.zoomLink || '',
      phone: body.phone || '',
      payment_terms: body.paymentTerms ?? null,
    }
    const bodyHtml = renderAgreementHtml(template, vars)

    const token = randomUUID()
    const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const { data: agreement, error: insErr } = await supabase
      .from('agreements')
      .insert({
        coach_id: coach.id,
        client_id: body.clientId,
        agreement_template_id: template.id,
        title: template.name,
        body_html: bodyHtml,
        status: 'sent',
        sign_token: token,
        signing_token_expires_at: expiresAt,
        client_name: body.clientName,
        client_email: body.clientEmail,
        coach_name: vars.coach_name,
        zoom_link: vars.zoom_link || null,
        phone: vars.phone || null,
        payment_terms: body.paymentTerms ?? null,
        sent_at: new Date().toISOString(),
      })
      .select('id, sign_token')
      .single()
    if (insErr || !agreement) {
      return NextResponse.json({ error: insErr?.message || 'Could not create the agreement.' }, { status: 500 })
    }

    const signUrl = `${getBaseUrl()}/sign/${agreement.sign_token}`
    const html = buildAgreementEmailHTML({ clientName: body.clientName, signUrl })

    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ access_token: session.accessToken as string })
    const gmail = google.gmail({ version: 'v1', auth })

    try {
      const raw = makeRawHtmlEmail({
        from: process.env.JEFF_FROM_EMAIL!,
        to: body.clientEmail,
        cc: process.env.JEFF_CC_EMAIL,
        subject: 'Your Coaching Agreement — theLeadershipWell',
        html,
      })
      await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
    } catch (e: any) {
      // The agreement row exists; surface the send failure so the coach can retry.
      return NextResponse.json({ error: e?.message || 'Agreement saved, but the email failed to send.' }, { status: 502 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return toErrorResponse(e)
  }
}
