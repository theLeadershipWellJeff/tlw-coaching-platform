import { NextRequest, NextResponse } from 'next/server'
import { adminContext, adminErrorResponse } from '@/lib/admin/route'
import { AdminError } from '@/lib/admin/debrief'
import { logAdminAction } from '@/lib/admin/audit'
import { isTransactionalEmailConfigured, sendTransactionalEmail } from '@/lib/email/transactional'
import { sendCoachHtmlEmail } from '@/lib/gmail'
import { logCommunication } from '@/lib/communications'

export const runtime = 'nodejs'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Act on a ticket. Body: { action: 'reply', body } emails the client (Resend
 * when configured, else the acting supervisor's Gmail), records the message,
 * and logs it to communications; { action: 'close' } closes it;
 * { action: 'reopen' } reopens.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase, actor } = await adminContext()
    const body = await req.json().catch(() => ({}))
    const { data: ticket } = await supabase.from('support_tickets').select('*').eq('id', params.id).maybeSingle()
    if (!ticket) throw new AdminError(404, 'Ticket not found.')

    if (body.action === 'close' || body.action === 'reopen') {
      const closing = body.action === 'close'
      const { error } = await supabase
        .from('support_tickets')
        .update({ status: closing ? 'closed' : 'open', closed_at: closing ? new Date().toISOString() : null, assigned_to: actor.id })
        .eq('id', ticket.id)
      if (error) throw new AdminError(500, error.message)
      await logAdminAction(supabase, { actorCoachId: actor.id, action: 'support_closed', targetClientId: ticket.client_id, detail: { ticket_id: ticket.id, reopened: !closing } })
      return NextResponse.json({ ok: true, status: closing ? 'closed' : 'open' })
    }

    if (body.action !== 'reply') throw new AdminError(400, 'action must be reply, close, or reopen.')
    const text = String(body.body || '').trim()
    if (!text) throw new AdminError(400, 'Reply is empty.')
    const { data: client } = await supabase.from('clients').select('id, name, email').eq('id', ticket.client_id).maybeSingle()
    if (!client?.email) throw new AdminError(400, 'This client has no email on file.')

    const subject = `Re: ${ticket.subject}`
    const html = `<div style="font-family:Georgia,'Times New Roman',serif;color:#111226;line-height:1.55;"><p style="white-space:pre-wrap;margin:0 0 16px;">${escapeHtml(text)}</p><p style="margin:16px 0 0;">— ${escapeHtml(actor.name || 'theLeadershipWell')}</p><hr style="border:none;border-top:1px solid #ddd;margin:20px 0;"/><p style="font-size:12px;color:#6b6b73;white-space:pre-wrap;">You wrote:\n${escapeHtml(ticket.body)}</p></div>`

    let ok = false
    let error: string | null = null
    if (isTransactionalEmailConfigured()) {
      const r = await sendTransactionalEmail({ to: client.email, subject, html, replyTo: actor.email || undefined })
      ok = r.ok
      error = r.ok ? null : r.error
    } else if (actor.google_refresh_token) {
      ok = await sendCoachHtmlEmail(actor, { to: client.email, cc: '', subject, html })
      error = ok ? null : 'Gmail send failed'
    } else {
      error = 'No email transport configured (Resend unset and no Gmail access).'
    }

    await supabase.from('support_ticket_messages').insert({ org_id: ticket.org_id, ticket_id: ticket.id, author_role: 'staff', author_id: actor.id, body: text })
    await supabase.from('support_tickets').update({ assigned_to: actor.id }).eq('id', ticket.id)
    await logCommunication(supabase, {
      coach_id: actor.id,
      client_id: client.id,
      type: 'email',
      direction: 'outbound',
      subject,
      preview: text.slice(0, 140),
      body_html: html,
      status: ok ? 'sent' : 'failed',
      error_detail: error,
    } as any)
    await logAdminAction(supabase, { actorCoachId: actor.id, action: 'support_reply', targetClientId: client.id, detail: { ticket_id: ticket.id, ok } })
    if (!ok) throw new AdminError(502, `The reply was recorded but the email failed: ${error}`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return adminErrorResponse(e)
  }
}
