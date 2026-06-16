import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { authOptions } from '@/lib/authOptions'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { getBaseUrl } from '@/lib/url'
import { buildAgreementEmailHTML } from '@/lib/agreement-email'
import { headerSafe, encodeHeaderValue } from '@/lib/email-mime'

export const runtime = 'nodejs'

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
 * Assign an agreement template to a client to sign. Snapshots the template body
 * into an `agreements` row, then emails the client the agreement with an
 * "I have read and agree" checkbox link. Body: { templateId, clientId }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const templateId = body.templateId
  const clientId = body.clientId
  if (!templateId || !clientId) return NextResponse.json({ error: 'templateId and clientId are required.' }, { status: 400 })

  const { data: template } = await supabase
    .from('note_templates')
    .select('id, name, content')
    .eq('id', templateId)
    .eq('coach_id', coach.id)
    .maybeSingle()
  if (!template) return NextResponse.json({ error: 'Agreement template not found.' }, { status: 404 })

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, email')
    .eq('id', clientId)
    .maybeSingle()
  if (!client) return NextResponse.json({ error: 'Client not found.' }, { status: 404 })
  if (!client.email) return NextResponse.json({ error: 'This client has no email on file.' }, { status: 400 })

  const { data: agreement, error: insErr } = await supabase
    .from('agreements')
    .insert({
      coach_id: coach.id,
      client_id: client.id,
      template_id: template.id,
      title: template.name,
      body_html: template.content || '',
      status: 'sent',
      sign_token: randomUUID(),
      sent_at: new Date().toISOString(),
    })
    .select('sign_token, title')
    .single()
  if (insErr || !agreement) return NextResponse.json({ error: insErr?.message || 'Could not create the agreement.' }, { status: 500 })

  const signUrl = `${getBaseUrl()}/api/agreements/sign?token=${agreement.sign_token}`
  const html = buildAgreementEmailHTML({
    clientName: client.name,
    title: agreement.title,
    bodyHtml: template.content || '',
    signUrl,
  })

  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ access_token: session.accessToken as string })
  const gmail = google.gmail({ version: 'v1', auth })

  try {
    const raw = makeRawHtmlEmail({
      from: process.env.JEFF_FROM_EMAIL!,
      to: client.email,
      cc: process.env.JEFF_CC_EMAIL,
      subject: `Please review and sign: ${agreement.title}`,
      html,
    })
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to send the agreement.' }, { status: 502 })
  }

  return NextResponse.json({ success: true })
}
