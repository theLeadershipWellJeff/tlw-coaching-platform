import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/authOptions'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { ApiError, readJson, toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'
import { claimNoteSend, releaseNoteClaim, sendSessionNoteEmail } from '@/lib/notes/send'
import { joinNarrative } from '@/lib/notes/narrative-format'
import { resolveTasksForNote } from '@/lib/coach-tasks/queue'

export const runtime = 'nodejs'
export const maxDuration = 60

const Schema = z.object({
  subject: z.string().trim().min(1, 'A subject is required.'),
  body: z.string().trim().min(1, 'The message body is empty.'),
  actions: z.array(z.string()).default([]),
  insights: z.array(z.string()).default([]),
})

/**
 * Send + close-out (Phase 3). Order, non-negotiable:
 *   claim-before-send (CAS, 068) → Gmail send → AWAIT success → communications
 *   row → note sent (status + 050 stamps) → resolve coach_task → respond.
 * A failed send logs the failure, releases the claim, and marks nothing.
 * Never closes optimistically — the client only leaves the editor on 200.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string; noteId: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const supabase = getSupabaseAdmin()
    const coach = await requireClientCoach(supabase, params.id)
    const input = await readJson(req, Schema)
    const actions = input.actions.map((a) => a.trim()).filter(Boolean)
    const insights = input.insights.map((a) => a.trim()).filter(Boolean)

    const { data: client } = await supabase.from('clients').select('id, name, email').eq('id', params.id).maybeSingle()
    if (!client) throw new ApiError(404, 'Client not found.')
    if (!client.email) throw new ApiError(400, 'This client has no email on file.')

    // 1. Claim. Exactly one caller gets past this line per attempt.
    const claim = await claimNoteSend(supabase, params.id, params.noteId)

    // 2. Send — awaited; the transport failure is logged inside and re-thrown.
    let sent
    try {
      sent = await sendSessionNoteEmail(supabase, {
        coach,
        accessToken: session.accessToken as string,
        client: { id: client.id, name: client.name, email: client.email },
        subject: input.subject,
        bodyText: input.body,
        actions,
        insights,
        noteId: params.noteId,
      })
    } catch (e) {
      await releaseNoteClaim(supabase, params.id, params.noteId)
      throw e
    }

    // 3. Close out the note. The email is delivered and logged; this stamp is
    //    what hides the note from the active workspace and feeds the portal.
    const now = new Date().toISOString()
    const { data: note, error: stampErr } = await supabase
      .from('notes')
      .update({
        status: 'sent',
        sent_to_client_at: now,
        client_communication_id: sent.communicationId,
        generated_narrative: joinNarrative(input.subject, input.body), // the exact text that went out
        send_claimed_at: null,
      })
      .eq('id', params.noteId)
      .eq('client_id', params.id)
      .select('id, client_id, session_date, calendar_event_id, status, sent_to_client_at, filed_at, created_at')
      .single()
    if (stampErr) console.error('note close-out stamp failed:', stampErr.message)

    // 4. Resolve the attention-queue task for this session (best-effort).
    let resolvedTasks = 0
    if (note) {
      try {
        resolvedTasks = await resolveTasksForNote(supabase, coach, params.id, note, 'sent')
      } catch (e) {
        console.error('task resolve after send failed:', e)
      }
    }

    return NextResponse.json({
      ok: true,
      sentAt: now,
      communicationId: sent.communicationId,
      gmailMessageId: sent.gmailMessageId,
      attempt: claim.attempt,
      idempotencyKey: claim.key,
      resolvedTasks,
    })
  } catch (e) {
    return toErrorResponse(e)
  }
}
