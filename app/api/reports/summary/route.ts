import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { summarize } from '@/lib/scoring/aggregate'

// Headline scorecard numbers for the dashboard card: average score across all
// sessions, strongest and lowest competency, plus the needs-review count.
export async function GET() {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: reports, error } = await supabase
    .from('session_reports')
    .select('*')
    .eq('coach_id', coach.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { count: needsReview } = await supabase
    .from('transcripts')
    .select('id', { count: 'exact', head: true })
    .eq('coach_id', coach.id)
    .eq('match_status', 'needs_review')

  return NextResponse.json({
    summary: summarize(reports || []),
    needsReview: needsReview || 0,
  })
}
