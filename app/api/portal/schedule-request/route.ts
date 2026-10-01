import { NextRequest, NextResponse } from 'next/server'
import { getPortalClientId } from '@/lib/portal/server'
import { checkPortalRateLimit, logPortalAccess } from '@/lib/portal/access'
import { logPortalEvent } from '@/lib/portal/events'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { resolveClientCoach } from '@/lib/portal/coach'
import { sendCoachHtmlEmail } from '@/lib/gmail'
import { isTransactionalEmailConfigured, sendTransactionalEmail } from '@/lib/email/transactional'
import { logCommunication } from '@/lib/communications'

export const runtime = 'nodejs'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function fmtWhen(iso: string, tz: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
      timeZone: tz || undefined,
    }).format(new Date(iso))
  } catch {
    return new Date(iso).toUTCString()
  }
}

/**
 * A client asks to book, move, or cancel a session from the portal. Goes to
 * the coach's scheduling assistant when one is set (Cc the coach), else to the
 * coach. Body: { kind: 'book' | 'reschedule' | 'cancel', appointmentId?, message? }.
 * Scoped to the authenticated portal client; an appointmentId that is not
 * theirs is a 404. Logged as an inbound communication on the client.
 */
export async function POST(req: NextRequest) {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limit = await checkPortalRateLimit(clientId, 'contact')
  if (!limit.allowed) {
    return NextResponse.json({ error: 'You have sent several requests already — you will hear back soon.' }, { status: 429 })
  }

  const body = await req.json().catch(() => ({}))
  const kind = body.kind === 'reschedule' || body.kind === 'cancel' ? body.kind : 'book'
  const message = String(body.message || '').trim()
  if (message.length > 3000) return NextResponse.json({ error: 'Message is too long.' }, { status: 400 })
  if (kind === 'book' && !message) return NextResponse.json({ error: 'Say when works for you.' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data: client } = await supabase.from('clients').select('id, name, email, timezone, client_type').eq('id', clientId).maybeSingle()
  if (!client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let when: string | null = null
  if (kind !== 'book') {
    const apptId = String(body.appointmentId || '')
    const { data: appt } = apptId
      ? await supabase.from('appointments').select('id, scheduled_at').eq('id', apptId).eq('client_id', clientId).maybeSingle()
      : { data: null }
    if (!appt) return NextResponse.json({ error: 'Session not found.' }, { status: 404 })
    when = fmtWhen(appt.scheduled_at, client.timezone)
  }

  const coach = await resolveClientCoach(clientId)
  if (!coach || !coach.email || client.client_type === 'portal') {
    return NextResponse.json({ error: 'No coach on file.' }, { status: 400 })
  }
  // Migration 074 — read on its own; absent = no assistant, the coach gets it.
  const assistant = await supabase
    .from('coaches')
    .select('scheduling_assistant_name, scheduling_assistant_email')
    .eq('id', coach.id)
    .maybeSingle()
    .then(
      (r) => (r.error ? null : (r.data as { scheduling_assistant_name: string | null; scheduling_assistant_email: string | null } | null)),
      () => null
    )
  const to = assistant?.scheduling_assistant_email || coach.email
  const cc = assistant?.scheduling_assistant_email ? coach.email : ''
  const coachName = coach.name || 'the coach'

  const ask = kind === 'book' ? 'would like to book a session' : kind === 'reschedule' ? 'would like to reschedule a session' : 'needs to cancel a session'
  const subject =
    kind === 'book'
      ? `Scheduling request: ${client.name} with ${coachName}`
      : `${kind === 'reschedule' ? 'Reschedule' : 'Cancel'} request: ${client.name} with ${coachName}`
  const html = `
    <div style="font-family:Georgia,serif;color:#111226;">
      <p><strong>${escapeHtml(client.name)}</strong> ${ask} with ${escapeHtml(coachName)} (sent from their client portal).</p>
      ${when ? `<p>Session: <strong>${escapeHtml(when)}</strong></p>` : ''}
      ${
        message
          ? `<blockquote style="margin:12px 0;padding:8px 14px;border-left:3px solid #F5821F;color:#333;">${escapeHtml(message).replace(/\n/g, '<br/>')}</blockquote>`
          : ''
      }
      ${
        client.email
          ? `<p style="font-size:13px;color:#6b6b73;">Reply to them at <a href="mailto:${escapeHtml(client.email)}">${escapeHtml(client.email)}</a>. Once it is on ${escapeHtml(coachName)}'s Google Calendar with them as a guest, it shows in their portal within the hour.</p>`
          : ''
      }
    </div>`

  // The coach's own Gmail first (the thread lands in their Sent folder); the
  // transactional sender (Reply-To the client) when the coach has no Gmail access.
  let sent = false
  let error: string | null = null
  if (coach.google_refresh_token) {
    try {
      sent = await sendCoachHtmlEmail(coach, { to, cc, subject, html })
      if (!sent) error = 'Gmail send failed'
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  }
  if (!sent && isTransactionalEmailConfigured()) {
    const r = await sendTransactionalEmail({ to, subject, html, replyTo: client.email || undefined })
    sent = r.ok
    if (!r.ok) error = r.error
    if (r.ok && cc) await sendTransactionalEmail({ to: cc, subject, html, replyTo: client.email || undefined })
  }

  await logCommunication(supabase, {
    coach_id: coach.id,
    client_id: client.id,
    type: 'email',
    direction: 'inbound',
    subject,
    preview: (message || subject).slice(0, 140),
    status: sent ? 'sent' : 'failed',
    ...(sent ? {} : { error_detail: error || 'No email transport available' }),
  } as any)
  await logPortalAccess(clientId, 'contact', { ok: sent, detail: `schedule_${kind}` })
  if (sent) await logPortalEvent(clientId, 'schedule_request', { kind, to_assistant: Boolean(assistant?.scheduling_assistant_email) })

  if (!sent) return NextResponse.json({ error: 'Could not send your request — please try again.' }, { status: 502 })
  return NextResponse.json({ ok: true, sentTo: assistant?.scheduling_assistant_name || (assistant?.scheduling_assistant_email ? 'the scheduling assistant' : coachName) })
}
