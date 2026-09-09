import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getCoachByEmail } from '@/lib/coach'
import { ingestMarkdown } from '@/lib/transcripts/ingest'
import { sendNeedsReviewEmail } from '@/lib/transcript-review-email'

// Scoring calls Claude on a full transcript — give the function room to run.
// A confident match auto-scores INSIDE this webhook: the engine allows up to
// 100s per attempt with one retry, plus the growth/nudge passes after the
// report lands. The old 60s cap let Vercel kill the function mid-score, which
// is why matched Plaud transcripts were landing "not scored".
export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Transcript ingest webhook.
 *
 * Called by Zapier when Plaud.ai finishes a transcript (the same md is also
 * archived to Google Drive). Authenticated with a shared secret, NOT a user
 * session. The actual work (dedupe, parse, match, score) lives in
 * ingestMarkdown, shared with the in-app manual add.
 *
 * Body: { filename?, markdown, title?|summary?, driveFileId?, coachEmail?, coachName? }
 *   - title/summary: an explicit human title (e.g. Zapier maps Plaud's summary here).
 * Header: x-ingest-secret: <INGEST_SECRET>
 *
 * SECURITY (2026-09-09): the coach is resolved GET-ONLY. A `coachEmail` with
 * no `coaches` row is refused (403) and the refusal is written to `cron_runs`
 * (job 'transcripts-ingest', status 'failed') so it is reviewable at
 * GET /api/admin/cron-runs?job=transcripts-ingest&status=failed. A webhook
 * can never create a coach — the secret holder no longer chooses the tenant.
 * The full markdown is not stored on refusal; Zapier's Drive archive keeps it.
 */
const INGEST_JOB = 'transcripts-ingest'

/** Reviewable record of a refused ingest — best-effort, never throws. */
async function recordIngestRejection(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  reason: string,
  detail: Record<string, unknown>
): Promise<void> {
  try {
    const now = new Date().toISOString()
    const { error } = await supabase.from('cron_runs').insert({
      job: INGEST_JOB,
      status: 'failed',
      started_at: now,
      finished_at: now,
      error: reason.slice(0, 4000),
      summary: detail,
    })
    if (error) console.error('[ingest] could not record rejection:', error.message)
  } catch (e) {
    console.error('[ingest] could not record rejection:', e)
  }
}
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

  // GET-ONLY coach resolution. No row → refuse + leave a reviewable record.
  let coach
  try {
    coach = await getCoachByEmail(supabase, coachEmail)
  } catch (e: any) {
    return NextResponse.json({ error: `Coach lookup failed: ${e.message}` }, { status: 500 })
  }
  if (!coach) {
    await recordIngestRejection(supabase, `rejected: no coaches row for ${coachEmail}`, {
      code: 'coach_not_found',
      coachEmail,
      coachName: body.coachName ?? null,
      filename: body.filename ?? null,
      title: body.title ?? body.summary ?? null,
      source: body.source || 'plaud',
      driveFileId: body.driveFileId ?? body.drive_file_id ?? null,
      markdownChars: markdown.length,
      preview: previewOf(markdown),
    })
    return NextResponse.json(
      { error: 'No coach is registered for this transcript — it was not filed.', code: 'coach_not_found' },
      { status: 403 }
    )
  }

  try {
    const result = await ingestMarkdown(supabase, {
      coach,
      markdown,
      filename: body.filename ?? null,
      title: body.title ?? body.summary ?? null,
      driveFileId: body.driveFileId ?? body.drive_file_id ?? null,
      source: body.source || 'plaud',
      // Zapier fires within minutes of the recording ending, so an undated
      // transcript can safely default to today (coach's timezone).
      assumeSessionToday: true,
    })

    // Hold-for-review-but-tell-me: a freshly ingested session that couldn't be
    // matched (and so wasn't scored) would otherwise sit silently in the queue.
    // Email the coach so nothing slips. Best-effort — never fail ingest on it.
    if (!result.duplicate && !result.reportId && result.matchStatus !== 'matched') {
      try {
        await sendNeedsReviewEmail(coach, {
          filename: result.title || body.filename || null,
          preview: previewOf(markdown),
        })
      } catch (e: any) {
        console.error('Needs-review email failed:', e?.message || e)
      }
    }

    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// First opening lines of the transcript (front matter stripped) for the email.
function previewOf(md: string): string {
  const body = md.replace(/^﻿?\s*---\s*\n[\s\S]*?\n---\s*\n?/, '')
  const text = body
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 180 ? `${text.slice(0, 180)}…` : text
}
