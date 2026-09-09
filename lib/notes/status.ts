/**
 * Session-note status helpers (migration 067). `status` is a VIEW filter only:
 * these predicates drive what the workspace shows, never what the prep engine,
 * nudges, scoring, or aggregates read. Sent truth = the 050 stamp OR status.
 */
import type { Note } from '../supabase/types'

type NoteBits = Pick<Note, 'status' | 'sent_to_client_at' | 'filed_at'>

export function isNoteSent(n: NoteBits): boolean {
  return n.status === 'sent' || !!n.sent_to_client_at
}

export function isNoteFiled(n: NoteBits): boolean {
  return !isNoteSent(n) && (n.status === 'filed' || !!n.filed_at)
}

/** Active = still in the coach's working view (neither sent nor filed). */
export function isNoteActive(n: NoteBits): boolean {
  return !isNoteSent(n) && !isNoteFiled(n)
}
