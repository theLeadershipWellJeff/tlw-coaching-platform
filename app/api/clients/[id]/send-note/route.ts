import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { authOptions } from '@/lib/authOptions'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'
import { persistActionLinks } from '@/lib/actions'
import { buildNoteEmailHTML } from '@/lib/client-note-email'
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
 * Send a cleaned-up note as a client-facing email. Persists each action item as
 * an `actions` row with an unguessable complete_token, renders the email with a
 * click-to-log checkbox per action, then sends HTML via Gmail.
 * Body: { subject, body, actions: string[], insights: string[], noteId? }
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)

    const body = await req.json().catch(() => ({}))
    const subject = (body.subject || '').trim()
    const bodyText = (body.body || '').trim()
    const noteId: string | null = body.noteId || null
    const actionTexts: string[] = Array.isArray(body.actions)
      ? body.actions.map((a: any) => String(a || '').trim()).filter(Boolean)
      : []
    const insights: string[] = Array.isArray(body.insights)
      ? body.insights.map((s: any) => String(s || '').trim()).filter(Boolean)
      : []
    if (!subject) return NextResponse.json({ error: 'A subject is required.' }, { status: 400 })
    if (!bodyText) return NextResponse.json({ error: 'The message body is empty.' }, { status: 400 })

    const { data: client } = await supabase
      .from('clients')
      .select('id, name, email')
      .eq('id', params.id)
      .maybeSingle()
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    if (!client.email) return NextResponse.json({ error: 'This client has no email on file.' }, { status: 400 })

    // Persist the actions so completions can be logged, and get a checkbox link
    // per action.
    const emailActions = await persistActionLinks(supabase, client.id, noteId, actionTexts)

    const html = buildNoteEmailHTML({ clientName: client.name, bodyText, insights, actions: emailActions })

    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ access_token: session.accessToken as string })
    const gmail = google.gmail({ version: 'v1', auth })

    try {
      const raw = makeRawHtmlEmail({
        from: process.env.JEFF_FROM_EMAIL!,
        to: client.email,
        cc: process.env.JEFF_CC_EMAIL,
        subject,
        html,
      })
      const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
      return NextResponse.json({ success: true, id: res.data.id })
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'Failed to send email.' }, { status: 502 })
    }
  } catch (e) {
    return toErrorResponse(e)
  }
}
