import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { withClientNames } from '@/lib/clientNames'

// List the signed-in coach's scored sessions, most recent first (spec §11).
export async function GET() {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('session_reports')
    .select(
      'id, client_id, client_initials, session_date, session_type, session_number, engagement_total, overall_score, band, coach_overall, status'
    )
    .eq('coach_id', coach.id)
    .order('session_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Resolve the client's full name in code (relationship types aren't
  // generated, so we don't use an embedded select). Names are shown in-app;
  // the stored initials stay the privacy-preserving label.
  const reports = await withClientNames(supabase, data || [])
  return NextResponse.json({ reports })
}
