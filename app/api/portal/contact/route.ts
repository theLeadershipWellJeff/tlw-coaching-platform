import { NextRequest, NextResponse } from 'next/server'
import { getPortalClientId } from '@/lib/portal/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { resolveClientCoach } from '@/lib/portal/coach'
import { sendCoachHtmlEmail } from '@/lib/gmail'
import { logCommunication } from '@/lib/communications'

export const runtime = 'nodejs'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** A client messages their coach from the portal. Scoped to the authenticated
 *  portal client; emails the coach (from the coach's own Gmail) and logs the
 *  message as an inbound communication. */
export async function POST(req: NextRequest) {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const message = String(body.message || '').trim()
  if (!message) return NextResponse.json({ error: 'Message is empty.' }, { status: 400 })
  if (message.length > 5000) return NextResponse.json({ error: 'Message is too long.' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data: client } = await supabase
    .from('clients')
    .select('id, name, email')
    .eq('id', clientId)
    .maybeSingle()
  if (!client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const coach = await resolveClientCoach(clientId)
  if (!coach || !coach.email) return NextResponse.json({ error: 'No coach on file.' }, { status: 400 })

  const subject = `Portal message from ${client.name}`
  const html = `
    <div style="font-family:Georgia,serif;color:#111226;">
      <p><strong>${escapeHtml(client.name)}</strong> sent you a message from their portal:</p>
      <blockquote style="margin:12px 0;padding:8px 14px;border-left:3px solid #F5821F;color:#333;">${escapeHtml(
        message
      ).replace(/\n/g, '<br/>')}</blockquote>
      ${
        client.email
          ? `<p style="font-size:13px;color:#6b6b73;">Reply to them at <a href="mailto:${client.email}">${client.email}</a>.</p>`
          : ''
      }
    </div>`

  const sent = await sendCoachHtmlEmail(coach, { to: coach.email, cc: '', subject, html })

  await logCommunication(supabase, {
    coach_id: coach.id,
    client_id: client.id,
    type: 'email',
    direction: 'inbound',
    subject,
    preview: message.slice(0, 140),
    status: sent ? 'sent' : 'failed',
  })

  if (!sent) return NextResponse.json({ error: 'Could not send your message.' }, { status: 502 })
  return NextResponse.json({ ok: true })
}
