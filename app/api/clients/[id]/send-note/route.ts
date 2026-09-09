import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'
import { sendSessionNoteEmail } from '@/lib/notes/send'

export const runtime = 'nodejs'

/**
 * Send a cleaned-up note as a client-facing email (the pre-Phase-3 path, kept
 * for the prep/legacy callers). The transport, logging, and action-link
 * persistence live in `lib/notes/send.ts#sendSessionNoteEmail` — the SAME core
 * the close-out route uses, so there is one send path. This route carries no
 * send claim; the close-out route (`/notes/[noteId]/send`) is the guarded one
 * and is what the editor's "Send to client" uses.
 * Body: { subject, body, actions: string[], insights: string[], noteId? }
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
    const actionTexts: string[] = Array.isArray(body.actions) ? body.actions.map((a: any) => String(a || '').trim()).filter(Boolean) : []
    const insights: string[] = Array.isArray(body.insights) ? body.insights.map((s: any) => String(s || '').trim()).filter(Boolean) : []
    if (!subject) return NextResponse.json({ error: 'A subject is required.' }, { status: 400 })
    if (!bodyText) return NextResponse.json({ error: 'The message body is empty.' }, { status: 400 })

    const { data: client } = await supabase.from('clients').select('id, name, email').eq('id', params.id).maybeSingle()
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    if (!client.email) return NextResponse.json({ error: 'This client has no email on file.' }, { status: 400 })

    const sent = await sendSessionNoteEmail(supabase, {
      coach,
      accessToken: session.accessToken as string,
      client: { id: client.id, name: client.name, email: client.email },
      subject,
      bodyText,
      actions: actionTexts,
      insights,
      noteId,
    })

    // Stamp the note so the editor can show "sent" and the portal can order by
    // session. Best-effort: the email is already delivered, and the
    // communications row is the authoritative record either way.
    if (noteId) {
      const { error: stampError } = await supabase
        .from('notes')
        .update({ status: 'sent', sent_to_client_at: new Date().toISOString(), client_communication_id: sent.communicationId })
        .eq('id', noteId)
        .eq('client_id', client.id)
      if (stampError) console.error('Failed to stamp note as sent:', stampError.message)
    }

    return NextResponse.json({ success: true, id: sent.gmailMessageId, communication: sent.communicationId ? { id: sent.communicationId } : null })
  } catch (e) {
    return toErrorResponse(e)
  }
}
