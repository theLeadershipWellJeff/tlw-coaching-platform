import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { ingestMarkdown } from '@/lib/transcripts/ingest'

export const runtime = 'nodejs'
// Scoring a full transcript can exceed a minute (engine times out at 100s).
export const maxDuration = 120

/**
 * Manual transcript add — paste a transcript into the app (e.g. to backfill
 * past sessions, or anything that didn't come through Zapier). Same pipeline as
 * the webhook, but authenticated by the signed-in coach's session and attributed
 * to that coach.
 *
 * Body: { markdown, title?, sessionDate?, autoScore? }
 *   - autoScore: false = add without scoring (the transcript still matches and
 *     files on the client; it can be scored later from their transcripts list).
 */
export async function POST(req: NextRequest) {
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
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const markdown: string = body.markdown ?? ''
  if (!markdown.trim()) {
    return NextResponse.json({ error: 'Transcript text is required.' }, { status: 400 })
  }
  const title: string | null = body.title?.trim() || null
  const sessionDate: string | null = body.sessionDate?.trim() || null

  try {
    const result = await ingestMarkdown(supabase, {
      coach,
      markdown,
      filename: title,
      source: 'manual',
      sessionDate,
      autoScore: body.autoScore !== false,
    })
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
