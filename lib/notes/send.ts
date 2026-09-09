/**
 * Session-note send — the ONE send path for a coach's note to a client
 * (Phase 3). Used by the close-out route (`/notes/[noteId]/send`) and the
 * older `/send-note` route alike, so there is never a parallel transport.
 *
 * Order, non-negotiable:
 *   claim (CAS on the note row, migration 068)
 *   → send via the coach's Gmail → AWAIT confirmed success
 *   → communications row (`type='session_note'`, the portal's gate)
 *   → note.status='sent' + sent_to_client_at + client_communication_id
 *   → resolve the coach_task
 * Failure at the send: the failure is logged to communications, the claim is
 * released, and nothing is marked sent.
 */
import { google } from 'googleapis'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Coach, Database } from '../supabase/types'
import { ApiError } from '../api-handler'
import { persistActionLinks } from '../actions'
import { buildNoteEmailHTML } from '../client-note-email'
import { headerSafe, encodeHeaderValue } from '../email-mime'
import { logCommunication, htmlToPreview } from '../communications'

type Db = SupabaseClient<Database>

/** A claim older than this is presumed dead (function killed mid-send) and may be re-claimed. */
export const STALE_CLAIM_MS = 3 * 60 * 1000

export function makeRawHtmlEmail(opts: { from: string; fromName: string; to: string; cc?: string; subject: string; html: string }): string {
  const lines = [`From: ${headerSafe(opts.fromName)} <${opts.from}>`, `To: ${headerSafe(opts.to)}`]
  if (opts.cc) lines.push(`Cc: ${headerSafe(opts.cc)}`)
  lines.push(`Subject: ${encodeHeaderValue(opts.subject)}`, 'MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', '', opts.html)
  return Buffer.from(lines.join('\r\n')).toString('base64url')
}

export type NoteSendClaim = { attempt: number; key: string }

/**
 * Claim the note for sending. Compare-and-set on `send_attempt`: the update
 * matches only if the counter still holds the value we read, the note is not
 * already sent, and no live claim exists. Two tabs → one winner, one 409.
 */
export async function claimNoteSend(supabase: Db, clientId: string, noteId: string): Promise<NoteSendClaim> {
  const { data: note, error } = await supabase
    .from('notes')
    .select('id, send_attempt, send_claimed_at, sent_to_client_at')
    .eq('id', noteId)
    .eq('client_id', clientId)
    .maybeSingle()
  if (error) throw new ApiError(500, error.message)
  if (!note) throw new ApiError(404, 'Note not found.')
  if (note.sent_to_client_at) throw new ApiError(409, 'This note has already been sent.')
  const current = note.send_attempt ?? 0
  const attempt = current + 1
  const key = `note:${noteId}:${attempt}`
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString()
  const { data: claimed, error: claimErr } = await supabase
    .from('notes')
    .update({ send_attempt: attempt, send_claimed_at: new Date().toISOString(), send_idempotency_key: key })
    .eq('id', noteId)
    .eq('client_id', clientId)
    .eq('send_attempt', current)
    .is('sent_to_client_at', null)
    .or(`send_claimed_at.is.null,send_claimed_at.lt.${staleBefore}`)
    .select('id')
  if (claimErr) {
    if (/send_attempt|send_claimed_at/.test(claimErr.message)) throw new ApiError(500, 'Apply migration 068 (note send claim) before sending.')
    throw new ApiError(500, claimErr.message)
  }
  if (!claimed || claimed.length === 0) throw new ApiError(409, 'This note is already being sent — check the client’s Recent Communication before trying again.')
  return { attempt, key }
}

export async function releaseNoteClaim(supabase: Db, clientId: string, noteId: string): Promise<void> {
  await supabase.from('notes').update({ send_claimed_at: null }).eq('id', noteId).eq('client_id', clientId)
}

export type SendNoteEmailInput = {
  coach: Coach
  accessToken: string
  client: { id: string; name: string; email: string }
  subject: string
  bodyText: string
  actions: string[]
  insights: string[]
  noteId: string | null
}

export type SendNoteEmailResult = {
  gmailMessageId: string | null
  communicationId: string | null
  html: string
}

/**
 * Persist the action links, build the branded HTML, send it through the
 * coach's Gmail, and log the result to communications (sent or failed). Throws
 * on a transport failure AFTER logging it, so a failure never vanishes.
 */
export async function sendSessionNoteEmail(supabase: Db, input: SendNoteEmailInput): Promise<SendNoteEmailResult> {
  const { coach, accessToken, client, subject, bodyText, actions, insights, noteId } = input
  const emailActions = await persistActionLinks(supabase, client.id, noteId, actions)
  const html = buildNoteEmailHTML({ clientName: client.name, bodyText, insights, actions: emailActions })

  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ access_token: accessToken })
  const gmail = google.gmail({ version: 'v1', auth })

  try {
    const raw = makeRawHtmlEmail({
      from: coach.email || process.env.JEFF_FROM_EMAIL!,
      fromName: coach.name || coach.email,
      to: client.email,
      cc: coach.email || process.env.JEFF_CC_EMAIL,
      subject,
      html,
    })
    const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
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
    return { gmailMessageId: res.data.id ?? null, communicationId: comm?.id ?? null, html }
  } catch (e: any) {
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
    throw new ApiError(502, e?.message || 'Failed to send email.')
  }
}
