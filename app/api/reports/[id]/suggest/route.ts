import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { parseTranscript } from '@/lib/transcripts/parse'
import { suggestCompetencyMove } from '@/lib/scoring/suggest'
import type { SessionReportJson } from '@/lib/scoring/types'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Generate a suggested coaching move to raise one competency on a scored report,
 * grounded in that session's transcript. Coach-scoped.
 * Body: { competencyId: number }
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const competencyId = Number(body.competencyId)
  if (!Number.isFinite(competencyId)) {
    return NextResponse.json({ error: 'competencyId is required.' }, { status: 400 })
  }

  const { data: row, error } = await supabase
    .from('session_reports')
    .select('id, transcript_id, report')
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const report = row.report as SessionReportJson
  const competency = report?.competencies?.find((c) => c.id === competencyId)
  if (!competency) {
    return NextResponse.json({ error: 'Unknown competency for this report.' }, { status: 400 })
  }

  // Pull the transcript body for grounding (best-effort — suggestion still works
  // from the evidence alone if the transcript can't be read).
  let transcriptBody = ''
  if (row.transcript_id) {
    const { data: t } = await supabase
      .from('transcripts')
      .select('filename, raw_md')
      .eq('id', row.transcript_id)
      .eq('coach_id', coach.id)
      .maybeSingle()
    if (t) transcriptBody = parseTranscript(t.filename, t.raw_md).body || t.raw_md
  }

  try {
    const suggestion = await suggestCompetencyMove({ competency, report, transcriptBody })
    return NextResponse.json({ suggestion })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not generate a suggestion.' }, { status: 502 })
  }
}
