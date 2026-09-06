import { NextRequest, NextResponse } from 'next/server'
import { getPortalClientId } from '@/lib/portal/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { checkPortalRateLimit, logPortalAccess } from '@/lib/portal/access'
import { logPortalEvent } from '@/lib/portal/events'
import { isTransactionalEmailConfigured, sendTransactionalEmail } from '@/lib/email/transactional'

export const runtime = 'nodejs'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * "Contact support" for a portal client who has no coach to write to. Opens a
 * support_tickets row (+ the first message) for the command-center queue
 * (Phase 4) and, best-effort, emails the support inbox so a ticket is never
 * silent in the meantime. Scoped to the session client; same rate limit as
 * contact-your-coach.
 */
export async function POST(req: NextRequest) {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limit = await checkPortalRateLimit(clientId, 'contact')
  if (!limit.allowed) {
    return NextResponse.json({ error: 'You have sent several messages already — we will be in touch.' }, { status: 429 })
  }
  const body = await req.json().catch(() => ({}))
  const message = String(body.message || '').trim()
  if (!message) return NextResponse.json({ error: 'Message is empty.' }, { status: 400 })
  if (message.length > 5000) return NextResponse.json({ error: 'Message is too long.' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data: client } = await supabase.from('clients').select('id, org_id, name, email, company_id').eq('id', clientId).maybeSingle()
  if (!client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const firstLine = message.split(/\r?\n/)[0].trim()
  const subject = (firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine) || 'Portal support request'

  const { data: ticket, error } = await supabase
    .from('support_tickets')
    .insert({ org_id: client.org_id, client_id: client.id, subject, body: message, status: 'open' })
    .select('id')
    .single()
  if (error || !ticket) return NextResponse.json({ error: 'Could not send your message right now.' }, { status: 500 })
  await supabase
    .from('support_ticket_messages')
    .insert({ org_id: client.org_id, ticket_id: ticket.id, author_role: 'client', author_id: client.id, body: message })

  await logPortalAccess(clientId, 'contact', { detail: `support:${ticket.id}` })
  await logPortalEvent(clientId, 'support_ticket_opened', { ticket_id: ticket.id })

  // Best-effort notification so the ticket is seen before the queue UI ships.
  const inbox = process.env.SUPPORT_NOTIFY_EMAIL || process.env.DEFAULT_COACH_EMAIL
  if (inbox && isTransactionalEmailConfigured()) {
    await sendTransactionalEmail({
      to: inbox,
      subject: `[Portal support] ${subject}`,
      replyTo: client.email || undefined,
      html: `<p>New support request from <strong>${escapeHtml(client.name || 'a portal client')}</strong>${client.email ? ` (${escapeHtml(client.email)})` : ''}:</p><blockquote style="border-left:3px solid #ccc;padding-left:12px;white-space:pre-wrap;">${escapeHtml(message)}</blockquote><p>Ticket ${ticket.id}</p>`,
    })
  }

  return NextResponse.json({ ok: true, ticketId: ticket.id })
}
