/**
 * Client narrative generation for the session-note send flow (Phase 3).
 *
 * Source rule (non-negotiable): the model is only ever asked to write when
 * there is real material — the coach's note, a matched transcript for that
 * session, or both. With neither, generation is BLOCKED and the coach composes
 * from blank; Claude never invents a session. Key info is never loaded here.
 *
 * The draft streams and is cached once on `notes.generated_narrative`
 * (format: lib/notes/narrative-format.ts); reopening reads the cache.
 */
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Note } from '../supabase/types'
import { CLIENT_VOICE_STANDARDS } from '../writing-standards'
import { htmlToPlainText } from '../communications'

type Db = SupabaseClient<Database>

export const NARRATIVE_MODEL = process.env.GENERATE_MODEL || 'claude-sonnet-4-6'
const TRANSCRIPT_CHAR_CAP = 40_000

export type NarrativeSource = {
  noteText: string
  transcriptText: string | null
  transcriptId: string | null
}

/** The material a narrative may draw on. Empty note + no transcript = nothing. */
export async function loadNarrativeSource(supabase: Db, clientId: string, note: Pick<Note, 'content' | 'session_date'>): Promise<NarrativeSource> {
  const noteText = htmlToPlainText(note.content || '').trim()
  let transcriptText: string | null = null
  let transcriptId: string | null = null
  if (note.session_date) {
    const { data } = await supabase
      .from('transcripts')
      .select('id, raw_md')
      .eq('client_id', clientId)
      .eq('session_date', note.session_date)
      .eq('match_status', 'matched')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data?.raw_md?.trim()) {
      transcriptId = data.id
      transcriptText = data.raw_md.length > TRANSCRIPT_CHAR_CAP ? data.raw_md.slice(0, TRANSCRIPT_CHAR_CAP) + '\n[… transcript truncated …]' : data.raw_md
    }
  }
  return { noteText, transcriptText, transcriptId }
}

export function hasSource(src: NarrativeSource): boolean {
  return !!src.noteText || !!src.transcriptText
}

export function buildNarrativePrompt(opts: { coachName: string; clientName: string; noteTitle?: string | null; source: NarrativeSource }): string {
  const { coachName, clientName, noteTitle, source } = opts
  const firstName = clientName.split(' ')[0] || 'there'
  const coachFirst = coachName.split(' ')[0] || coachName
  const basis = source.noteText && source.transcriptText
    ? "The coach's session note is the primary source; use the transcript only to fill in what the note refers to. Never add a topic the note doesn't touch."
    : source.noteText
      ? "The coach's session note is the only source."
      : 'There is no coach note — the session transcript is the only source. Recap only what was actually discussed.'

  return `You are ${coachName}, executive coach at theLeadershipWell. Write a terse, client-facing recap of our session for ${clientName}.

${basis}

Guidelines:
- Be brief and scannable. Prefer bullet lists (- item) over prose wherever there are multiple related points — themes explored, what surfaced, key decisions, shifts in thinking.
- One short opening sentence greeting ${firstName}. One short closing sentence. No filler or padding.
- Keep the coach's warm, direct voice, but scannable structure beats wordiness.
- Do NOT list the "ACTION:" or "INSIGHT:" items from the note — those are appended separately as an interactive checklist and an Insights list; repeating them would duplicate.
- Do NOT invent anything not in the source. If the source is thin, keep the recap very short.
- Sign off with "${coachFirst}". No AI mention.

${CLIENT_VOICE_STANDARDS}

OUTPUT FORMAT — exactly this, no markdown fences, no preamble:
SUBJECT: <short, specific subject line>

<the recap as plain text; bullet lists as "- item" lines>

${source.noteText ? `RAW SESSION NOTE${noteTitle ? ` (“${String(noteTitle).trim()}”)` : ''}:\n${source.noteText}\n` : ''}${source.transcriptText ? `\nSESSION TRANSCRIPT:\n${source.transcriptText}\n` : ''}`
}

/** Stream the narrative text (SUBJECT line first, then body). */
export async function* streamNarrative(prompt: string): AsyncGenerator<string, void, unknown> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured.')
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const stream = anthropic.messages.stream(
    { model: NARRATIVE_MODEL, max_tokens: 1500, messages: [{ role: 'user', content: prompt }] },
    { timeout: 60_000, maxRetries: 1 }
  )
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') yield event.delta.text
  }
}
