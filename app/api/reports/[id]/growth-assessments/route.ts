import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'

export const runtime = 'nodejs'

/**
 * Fetch growth area assessments for a session report.
 * Returns assessments joined with the growth area title + band_scale so the
 * report view can render the cards without a second fetch.
 * Coach-scoped; returns [] when the coach has no growth areas or this session
 * produced no assessments.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify the report belongs to this coach.
  const { data: report } = await supabase
    .from('session_reports')
    .select('id')
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .maybeSingle()
  if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: assessments, error } = await supabase
    .from('growth_area_assessments')
    .select('*, coach_growth_areas(title, band_scale, status)')
    .eq('session_id', params.id)
    .eq('coach_id', coach.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ assessments: assessments ?? [] })
}
