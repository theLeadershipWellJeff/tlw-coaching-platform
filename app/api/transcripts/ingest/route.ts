import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'
import { parseTranscript } from '@/lib/transcripts/parse'
import { matchClient, type RosterClient } from '@/lib/transcripts/match'
import { getOrCreateCoach } from '@/lib/coach'
import { runAndStoreReport } from '@/lib/scoring/store'

// Scoring calls Claude on a full transcript — give the function room to run.
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Transcript ingest webhook.
 *
 * Called by Zapier when Plaud.ai finishes a transcript (the same md is also
 * archived to Google Drive). Authenticated with a shared secret, NOT a user
 * session. Idempotent on the markdown's content hash, so re-delivery — or the
 * Drive copy arriving too — can't double up. On a confident client match it
 * auto-scores; otherwise it parks the transcript for manual confirmation
 * (fail-loud, spec §19).
 *
 * Body: { filename?, markdown, driveFileId?, coachEmail?, coachName? }
 * Header: x-ingest-secret: <INGEST_SECRET>
 */
export async function POST(req: NextRequest) {
  const secret = process.env.INGEST_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: 'Ingest is not configured (set INGEST_SECRET).' },
      { status: 503 }
    )
  }
  if (req.headers.get('x-ingest-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const markdown: string = body.markdown ?? body.content ?? body.transcript ?? ''
  if (!markdown.trim()) {
    return NextResponse.json({ error: 'markdown is required' }, { status: 400 })
  }
  const filename: string | null = body.filename ?? null
  const driveFileId: string | null = body.driveFileId ?? body.drive_file_id ?? null

  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const contentHash = createHash('sha256').update(markdown).digest('hex')

  // Idempotency: already ingested this exact transcript?
  const { data: dupe } = await supabase
    .from('transcripts')
    .select('id, match_status, client_id')
    .eq('content_hash', contentHash)
    .maybeSingle()
  if (dupe) {
    return NextResponse.json({
      duplicate: true,
      transcriptId: dupe.id,
      matchStatus: dupe.match_status,
    })
  }

  // Which coach does this belong to? Default to the configured owner in beta.
  const coachEmail = (body.coachEmail || process.env.DEFAULT_COACH_EMAIL || '').trim().toLowerCase()
  if (!coachEmail) {
    return NextResponse.json(
      { error: 'No coach for transcript (pass coachEmail or set DEFAULT_COACH_EMAIL).' },
      { status: 400 }
    )
  }
  let coach
  try {
    coach = await getOrCreateCoach(supabase, coachEmail, body.coachName || process.env.DEFAULT_COACH_NAME || coachEmail)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const parsed = parseTranscript(filename, markdown)

  // Match against the roster (fail-loud).
  const { data: roster } = await supabase.from('clients').select('id, name')
  const match = matchClient(parsed.clientNameRaw, (roster || []) as RosterClient[])

  const insert: Database['public']['Tables']['transcripts']['Insert'] = {
    coach_id: coach.id,
    client_id: match.clientId,
    client_initials: parsed.clientInitials,
    source: body.source || 'plaud',
    drive_file_id: driveFileId,
    filename,
    raw_md: markdown,
    content_hash: contentHash,
    session_date: parsed.sessionDate,
    match_status: match.status,
    match_confidence: match.confidence,
  }

  const { data: transcript, error: insErr } = await supabase
    .from('transcripts')
    .insert(insert)
    .select('*')
    .single()
  if (insErr) {
    return NextResponse.json({ error: `Supabase: ${insErr.message}` }, { status: 500 })
  }

  const autoScore = process.env.AUTO_SCORE !== 'false'
  let reportId: string | null = null
  let scoringError: string | null = null

  // Auto-score only on a confident match with a usable transcript.
  if (autoScore && match.status === 'matched' && match.clientId) {
    if (!parsed.isSpeakerSeparated) {
      scoringError = 'Transcript is not speaker-separated; metrics will be unavailable.'
    }
    try {
      const report = await runAndStoreReport(supabase, transcript, coach.name)
      reportId = report.id
    } catch (e: any) {
      scoringError = e.message
    }
  }

  return NextResponse.json({
    transcriptId: transcript.id,
    matchStatus: match.status,
    matchConfidence: Number(match.confidence.toFixed(2)),
    clientInitials: parsed.clientInitials,
    speakerSeparated: parsed.isSpeakerSeparated,
    reportId,
    scoringError,
  })
}
