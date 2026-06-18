import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getOrCreateCoach } from '@/lib/coach'
import { ingestMarkdown } from '@/lib/transcripts/ingest'

// Scoring calls Claude on a full transcript — give the function room to run. A
// long session can take well over a minute; the engine's own 100s client
// timeout sits just under this so a slow call fails clean instead of being
// killed mid-score.
export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * Transcript ingest webhook.
 *
 * Called by Zapier when Plaud.ai finishes a transcript (the same md is also
 * archived to Google Drive). Authenticated with a shared secret, NOT a user
 * session. The actual work (dedupe, parse, match, score) lives in
 * ingestMarkdown, shared with the in-app manual add.
 *
 * Body: { filename?, markdown, driveFileId?, coachEmail?, coachName? }
 * Header: x-ingest-secret: <INGEST_SECRET>
 */
export async function POST(req: NextRequest) {
  const secret = process.env.INGEST_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Ingest is not configured (set INGEST_SECRET).' }, { status: 503 })
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

  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const coachEmail = (body.coachEmail || process.env.DEFAULT_COACH_EMAIL || '').trim().toLowerCase()
  if (!coachEmail) {
    return NextResponse.json(
      { error: 'No coach for transcript (pass coachEmail or set DEFAULT_COACH_EMAIL).' },
      { status: 400 }
    )
  }

  try {
    const coach = await getOrCreateCoach(
      supabase,
      coachEmail,
      body.coachName || process.env.DEFAULT_COACH_NAME || coachEmail
    )
    const result = await ingestMarkdown(supabase, {
      coach,
      markdown,
      filename: body.filename ?? null,
      driveFileId: body.driveFileId ?? body.drive_file_id ?? null,
      source: body.source || 'plaud',
    })
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
