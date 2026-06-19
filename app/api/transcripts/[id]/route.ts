import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { runAndStoreReport } from '@/lib/scoring/store'
import { parseTranscript } from '@/lib/transcripts/parse'

export const runtime = 'nodejs'
// Scoring a full transcript can exceed a minute (engine times out at 100s).
export const maxDuration = 120

const PREVIEW_CHARS = 2000

/**
 * Return a transcript's metadata plus a short body preview, so the review queue
 * can show enough of an unmatched/timestamp-named transcript for the coach to
 * recognize whose session it is before assigning a client.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: transcript, error } = await supabase
    .from('transcripts')
    .select('id, filename, session_date, source, raw_md')
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!transcript) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const parsed = parseTranscript(transcript.filename, transcript.raw_md)
  const body = (parsed.body || transcript.raw_md).trim()

  return NextResponse.json({
    id: transcript.id,
    filename: transcript.filename,
    session_date: transcript.session_date,
    source: transcript.source,
    speakerSeparated: parsed.isSpeakerSeparated,
    preview: body.slice(0, PREVIEW_CHARS),
    truncated: body.length > PREVIEW_CHARS,
  })
}

/**
 * Resolve a needs-review transcript by confirming its client, then score it.
 * Also used to re-score (pass rescore: true without changing the client).
 * Body: { clientId?: string, rescore?: boolean }
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const { data: transcript, error: readErr } = await supabase
    .from('transcripts')
    .select('*')
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!transcript) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Confirm the client assignment if one was provided.
  if (body.clientId) {
    const { data: client } = await supabase
      .from('clients')
      .select('id, name')
      .eq('id', body.clientId)
      .maybeSingle()
    if (!client) return NextResponse.json({ error: 'Unknown client' }, { status: 400 })

    const { data: updated, error: updErr } = await supabase
      .from('transcripts')
      .update({ client_id: client.id, match_status: 'matched', match_confidence: 1 })
      .eq('id', transcript.id)
      .select('*')
      .single()
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
    transcript.client_id = updated.client_id
    transcript.match_status = updated.match_status
  }

  if (!transcript.client_id) {
    return NextResponse.json(
      { error: 'Assign a client before scoring (clientId required).' },
      { status: 400 }
    )
  }

  try {
    const report = await runAndStoreReport(supabase, transcript, coach)
    return NextResponse.json({ reportId: report.id, matchStatus: transcript.match_status })
  } catch (e: any) {
    return NextResponse.json({ error: `Scoring failed: ${e.message}` }, { status: 500 })
  }
}

/**
 * Delete a transcript (e.g. a pulled-in recording that isn't a coaching
 * session). Coach-scoped. Any scored report for it is removed first so the
 * delete succeeds regardless of the FK's on-delete behavior.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: transcript } = await supabase
    .from('transcripts')
    .select('id')
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .maybeSingle()
  if (!transcript) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await supabase.from('session_reports').delete().eq('transcript_id', params.id)

  const { error } = await supabase
    .from('transcripts')
    .delete()
    .eq('id', params.id)
    .eq('coach_id', coach.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ deleted: true })
}
