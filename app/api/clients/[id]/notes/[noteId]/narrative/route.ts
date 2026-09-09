import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { ApiError, toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'
import { coachDisplayName } from '@/lib/coach'
import { buildNarrativePrompt, hasSource, loadNarrativeSource, streamNarrative } from '@/lib/notes/narrative'
import { joinNarrative, splitNarrative } from '@/lib/notes/narrative-format'

export const runtime = 'nodejs'
export const maxDuration = 90

async function loadNote(supabase: ReturnType<typeof getSupabaseAdmin>, clientId: string, noteId: string) {
  const { data, error } = await supabase
    .from('notes')
    .select('id, client_id, title, content, session_date, generated_narrative, narrative_generated_at, sent_to_client_at, status')
    .eq('id', noteId)
    .eq('client_id', clientId)
    .maybeSingle()
  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(404, 'Note not found.')
  return data
}

/** The cached narrative (never regenerates) + whether there is source material at all. */
export async function GET(_req: NextRequest, { params }: { params: { id: string; noteId: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)
    const note = await loadNote(supabase, params.id, params.noteId)
    const source = await loadNarrativeSource(supabase, params.id, note)
    return NextResponse.json({
      cached: !!note.generated_narrative,
      generatedAt: note.narrative_generated_at ?? null,
      ...splitNarrative(note.generated_narrative),
      hasSource: hasSource(source),
      hasTranscript: !!source.transcriptText,
      sent: !!note.sent_to_client_at,
    })
  } catch (e) {
    return toErrorResponse(e)
  }
}

/**
 * Generate the client narrative — STREAMED as plain text (SUBJECT line first),
 * and persisted to `generated_narrative` the moment the stream completes so a
 * reopen never regenerates. `?force=1` redrafts on purpose (explicit ↻).
 * With no note text AND no transcript the call is refused (409 `no_source`):
 * the coach composes from blank instead — Claude never invents a session.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string; noteId: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireClientCoach(supabase, params.id)
    const note = await loadNote(supabase, params.id, params.noteId)
    if (note.sent_to_client_at) throw new ApiError(409, 'This note has already been sent; its narrative is read-only.')
    const force = new URL(req.url).searchParams.get('force') === '1'
    if (note.generated_narrative && !force) {
      // Cached — serve it as a one-chunk "stream" so the client path is the same.
      return new Response(note.generated_narrative, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Narrative-Cached': '1' } })
    }
    const source = await loadNarrativeSource(supabase, params.id, note)
    if (!hasSource(source)) {
      return NextResponse.json({ error: 'No session note and no transcript for this session — write the message yourself.', reason: 'no_source' }, { status: 409 })
    }
    const { data: client } = await supabase.from('clients').select('name').eq('id', params.id).maybeSingle()
    const prompt = buildNarrativePrompt({
      coachName: coachDisplayName(coach),
      clientName: client?.name || 'there',
      noteTitle: note.title,
      source,
    })

    const encoder = new TextEncoder()
    const noteId = note.id
    const clientId = params.id
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let full = ''
        try {
          for await (const delta of streamNarrative(prompt)) {
            full += delta
            controller.enqueue(encoder.encode(delta))
          }
        } catch (e) {
          console.error('narrative stream failed:', e)
          if (!full) controller.enqueue(encoder.encode(''))
        } finally {
          controller.close()
          if (full.trim()) {
            const { subject, body } = splitNarrative(full)
            try {
              await supabase
                .from('notes')
                .update({ generated_narrative: joinNarrative(subject, body), narrative_generated_at: new Date().toISOString() })
                .eq('id', noteId)
                .eq('client_id', clientId)
                .is('sent_to_client_at', null)
            } catch (e) {
              console.error('narrative cache write failed:', e)
            }
          }
        }
      },
    })
    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Narrative-Source': source.transcriptText ? (source.noteText ? 'note+transcript' : 'transcript') : 'note' },
    })
  } catch (e) {
    return toErrorResponse(e)
  }
}

/** Autosave the coach's edits to the narrative draft. Refused once sent (read-only forever). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string; noteId: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)
    const body = await req.json().catch(() => ({}))
    const subject = String(body.subject ?? '')
    const text = String(body.body ?? '')
    const { data, error } = await supabase
      .from('notes')
      .update({ generated_narrative: joinNarrative(subject, text) })
      .eq('id', params.noteId)
      .eq('client_id', params.id)
      .is('sent_to_client_at', null)
      .select('id')
    if (error) throw new ApiError(500, error.message)
    if (!data || data.length === 0) throw new ApiError(409, 'This note has been sent; its narrative is read-only.')
    return NextResponse.json({ ok: true })
  } catch (e) {
    return toErrorResponse(e)
  }
}
