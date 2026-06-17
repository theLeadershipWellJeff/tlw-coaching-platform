import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { runAndStoreReport } from '@/lib/scoring/store'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Re-score a stored report against the current rubric/engine. Used when the
 * rubric is updated and the coach wants the machine score refreshed without
 * re-importing the transcript. Coach-scoped.
 *
 * Re-runs `runAndStoreReport`, which upserts on transcript_id — so the machine
 * report (scores, metrics, WIN, suggested moves) is replaced, while the coach's
 * own self-scores/notes live in separate columns and are left untouched. A
 * 'reviewed' report stays 'reviewed'. No scorecard email is sent on a rescore.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: existing, error } = await supabase
    .from('session_reports')
    .select('id, transcript_id, status')
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // The transcript is the source of truth for a rescore.
  const { data: transcript } = await supabase
    .from('transcripts')
    .select('*')
    .eq('id', existing.transcript_id)
    .eq('coach_id', coach.id)
    .maybeSingle()
  if (!transcript) {
    return NextResponse.json(
      { error: 'The original transcript is no longer available, so this report can’t be re-scored.' },
      { status: 400 }
    )
  }

  try {
    const report = await runAndStoreReport(supabase, transcript, coach, { sendEmail: false })

    // Preserve the coach's review state — rescoring only refreshes the machine
    // score, not the fact that the coach already reviewed it.
    if (existing.status === 'reviewed') {
      await supabase
        .from('session_reports')
        .update({ status: 'reviewed' })
        .eq('id', params.id)
        .eq('coach_id', coach.id)
    }

    return NextResponse.json({ report })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not re-score this session.' }, { status: 502 })
  }
}
