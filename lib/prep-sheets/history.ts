/**
 * Server-side client-history gather for the background prep-sheet pipeline.
 *
 * The interactive generator pulls Coach Accountable notes + Zoom summaries in the
 * browser; a cron can't. This reads the client's history straight from Supabase —
 * `notes` plus `matched` `transcripts` within the coach's history window — and
 * produces both the generator's input and the eligibility audit record.
 *
 * KEY-INFO WALL (§ invariant 2): this is the highest-risk read surface in the
 * app. Every select here is an EXPLICIT column list, and `clients.key_info` is
 * never among them — enforced structurally, not by prompt instruction.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, PrepSheetEligibility } from '@/lib/supabase/types'
import type { PrepNoteInput } from './content'

// Caps so a very long history (or a large transcript) can't blow the Claude
// context/time budget. Newest material wins.
const MAX_ENTRIES = 12
const MAX_NOTE_CHARS = 4000
const MAX_TRANSCRIPT_CHARS = 8000

export type PrepHistory = {
  eligible: boolean
  notes: PrepNoteInput[] // generator input, newest first (notes + matched transcripts)
  eligibility: PrepSheetEligibility
}

/** Strip rich-text HTML to plain text (block tags → newlines). */
function toText(html: string): string {
  return (html || '')
    .replace(/<\/(p|div|li|h[1-6]|ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/** Effective date of a history row: the session date if set, else created_at. */
function effectiveDate(sessionDate: string | null, createdAt: string): string {
  return sessionDate || createdAt
}

export async function gatherClientHistory(
  supabase: SupabaseClient<Database>,
  clientId: string,
  historyWindowDays: number
): Promise<PrepHistory> {
  const cutoffMs = Date.now() - historyWindowDays * 24 * 60 * 60 * 1000

  // Notes — explicit columns; `content` is HTML we flatten. Recent first.
  const { data: noteRows } = await supabase
    .from('notes')
    .select('id, session_date, title, content, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(30)

  // Matched transcripts only — needs_review/unmatched are not confident history.
  const { data: transcriptRows } = await supabase
    .from('transcripts')
    .select('id, session_date, title, raw_md, created_at')
    .eq('client_id', clientId)
    .eq('match_status', 'matched')
    .order('created_at', { ascending: false })
    .limit(20)

  const notesInWindow = (noteRows || []).filter(
    (n) => new Date(effectiveDate(n.session_date, n.created_at)).getTime() >= cutoffMs
  )
  const transcriptsInWindow = (transcriptRows || []).filter(
    (t) => new Date(effectiveDate(t.session_date, t.created_at)).getTime() >= cutoffMs
  )

  // Eligibility audit — what history exists (and what we used), for the report.
  const eligibility: PrepSheetEligibility = {
    note_count: notesInWindow.length,
    transcript_count: transcriptsInWindow.length,
    most_recent_note_at: notesInWindow[0]
      ? effectiveDate(notesInWindow[0].session_date, notesInWindow[0].created_at)
      : null,
    most_recent_transcript_at: transcriptsInWindow[0]
      ? effectiveDate(transcriptsInWindow[0].session_date, transcriptsInWindow[0].created_at)
      : null,
    note_ids: notesInWindow.map((n) => n.id),
    transcript_ids: transcriptsInWindow.map((t) => t.id),
  }

  const eligible = notesInWindow.length > 0 || transcriptsInWindow.length > 0

  // Build the generator input: notes and matched transcripts as dated entries,
  // merged newest-first and capped. Transcripts are labeled so the model reads
  // them as session substance (the generator treats this slot as SESSION NOTES).
  const entries: { at: number; input: PrepNoteInput }[] = []
  for (const n of notesInWindow) {
    const at = new Date(effectiveDate(n.session_date, n.created_at)).getTime()
    const body = toText(n.content).slice(0, MAX_NOTE_CHARS)
    if (body) entries.push({ at, input: { date: effectiveDate(n.session_date, n.created_at), content: body } })
  }
  for (const t of transcriptsInWindow) {
    const at = new Date(effectiveDate(t.session_date, t.created_at)).getTime()
    const body = (t.raw_md || '').slice(0, MAX_TRANSCRIPT_CHARS)
    if (body) {
      entries.push({
        at,
        input: { date: effectiveDate(t.session_date, t.created_at), content: `[Session transcript]\n${body}` },
      })
    }
  }
  entries.sort((a, b) => b.at - a.at)
  const notes = entries.slice(0, MAX_ENTRIES).map((e) => e.input)

  return { eligible, notes, eligibility }
}
