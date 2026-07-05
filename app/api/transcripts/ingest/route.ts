import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getOrCreateCoach } from '@/lib/coach'
import { ingestMarkdown } from '@/lib/transcripts/ingest'
import { sendNeedsReviewEmail } from '@/lib/transcript-review-email'

// Scoring calls Claude on a full transcript — give the function room to run.
export const runtime = 'nodejs'
export const maxDuration = 60

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
