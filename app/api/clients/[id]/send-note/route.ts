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
import { logCommunication, htmlToPreview } from '@/lib/communications'

export const runtime = 'nodejs'

function makeRawHtmlEmail(opts: { from: string; fromName: string; to: string; cc?: string; subject: string; html: string }): string {
  const lines = [`From: ${headerSafe(opts.fromName)} <${opts.from}>`, `To: ${headerSafe(opts.to)}`]
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
 *
 * Every send is logged to `communications` as `type = 'session_note'` with the
 * exact HTML the client received (migration 050). That row is the record the
 * Client Portal reads — the portal shows ONLY notes that were actually sent, so
 * a coach's raw working note never crosses the boundary. Failures are logged
 * too, so a bad send surfaces on the Recent Communication card instead of
 * vanishing.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getSupabaseAdmin()
    const coach = await requireClientCoach(supabase, params.id)

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
      // Sent through the signed-in coach's Gmail — From and the self-Cc are theirs.
      const raw = makeRawHtmlEmail({
        from: coach.email || process.env.JEFF_FROM_EMAIL!,
        fromName: coach.name || coach.email,
        to: client.email,
        cc: coach.email || process.env.JEFF_CC_EMAIL,
        subject,
        html,
      })
      const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })

      // Record the sent version — this is what the client portal will show, and
      // what the Recent Communication card reads. Logging never throws, so a
      // logging hiccup can't mask a send that already happened.
      const comm = await logCommunication(supabase, {
        coach_id: coach.id,
        client_id: client.id,
        type: 'session_note',
        direction: 'outbound',
        subject,
        preview: htmlToPreview(html),
        body_html: html,
        status: 'sent',
        gmail_message_id: res.data.id ?? null,
      })

      // Stamp the note so the editor can show "sent" and the portal can order by
      // session. Best-effort: the email is already delivered, and the
      // communications row above is the authoritative record either way.
      if (noteId) {
        const { error: stampError } = await supabase
          .from('notes')
          .update({
            sent_to_client_at: new Date().toISOString(),
            client_communication_id: comm?.id ?? null,
          })
          .eq('id', noteId)
          .eq('client_id', client.id)
        if (stampError) console.error('Failed to stamp note as sent:', stampError.message)
      }

      return NextResponse.json({ success: true, id: res.data.id, communication: comm })
    } catch (e: any) {
      // Never silently drop — record the failure so it surfaces on the card.
      await logCommunication(supabase, {
        coach_id: coach.id,
        client_id: client.id,
        type: 'session_note',
        direction: 'outbound',
        subject,
        preview: htmlToPreview(html),
        body_html: html,
        status: 'failed',
        error_detail: e?.message || 'Gmail send failed',
      })
      return NextResponse.json({ error: e?.message || 'Failed to send email.' }, { status: 502 })
    }
  } catch (e) {
    return toErrorResponse(e)
  }
}
